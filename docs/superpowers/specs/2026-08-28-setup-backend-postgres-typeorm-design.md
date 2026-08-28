# Setup inicial del backend y conexión a PostgreSQL con TypeORM

**Fecha:** 2026-08-28
**Proyecto:** Mini ERP Multi-negocio — Sistema de Gestión de Inventario y Ventas
**Estado:** diseño aprobado, listo para plan de implementación

---

## 1. Contexto

El diseño técnico del ERP ya está cerrado: modelo de datos, estrategia de aislamiento multi-tenant por `business_id` y estándar de errores de la API. Lo que falta es escribir código, y este documento cubre el primer tramo.

El proyecto completo es demasiado grande para un solo spec, así que se descompone. Este es el primer sub-proyecto; el MVP (auth, productos, ventas, dashboard) tendrá su propio ciclo de spec → plan → implementación.

## 2. Alcance

### Dentro

1. Repositorio git inicializado como monorepo.
2. Backend NestJS scaffoldeado en `backend/`.
3. PostgreSQL local vía Docker Compose.
4. Configuración de entorno con validación al arranque.
5. Conexión TypeORM ↔ PostgreSQL, compartida entre la app y el CLI.
6. Las cinco entidades del modelo de datos, con sus relaciones e índices.
7. Migración inicial que crea el esquema completo.
8. Endpoint `GET /health` que verifica la conexión a la base.

### Fuera

- Cualquier lógica de negocio o endpoint de dominio.
- Autenticación, JWT, guards, decoradores `@Public()` / `@CurrentBusiness()`.
- El andamiaje de errores (`AppException`, exception filter, `exceptionFactory`).
- El frontend Angular. La carpeta `frontend/` no se crea todavía.
- Deploy y configuración de base en la nube.
- Tests automáticos (ver sección 12).

### Criterio de terminado

Esta secuencia corre limpia desde un clone del repo:

```bash
docker compose up -d
cd backend
cp .env.example .env
npm install
npm run migration:run
npm run start:dev
```

Y `GET http://localhost:3000/health` responde `200 { "status": "ok", "database": "up" }`.

Además, la inspección directa de la base confirma que los índices existen tal como se diseñaron — en particular el índice parcial y el funcional, que son los que TypeORM tiene más chances de generar mal:

```bash
docker compose exec db psql -U erp -d erp -c "\d products"
docker compose exec db psql -U erp -d erp -c "\d categories"
```

---

## 3. Decisiones y sus razones

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Monorepo `backend/` + `frontend/` | Dos repos separados; monorepo con Nx | Un solo link de portfolio que cuenta la historia de punta a punta. Sin tooling de monorepo: son dos proyectos independientes que conviven, y Nx sumaría una capa nueva encima de tres tecnologías que ya son nuevas. |
| PostgreSQL vía Docker Compose | Neon/Supabase desde el día 1; instalación nativa | Base descartable y reproducible por cualquiera que clone el repo. El setup queda versionado. |
| `synchronize: false` desde el día 1 | `synchronize: true` en desarrollo | Un solo flujo para dev y prod. `synchronize` no genera bien el índice parcial `WHERE active = true`, y la divergencia dev/prod aparece recién cuando ya es cara de arreglar. |
| Naming strategy automática snake_case | `@Column({ name: '...' })` explícito en cada columna | Ver sección 5.4. |
| Entidades listadas explícitamente, no por glob | Glob `dist/**/*.entity.js` | Los globs rompen en varios entornos de deploy con un error difícil de diagnosticar (`No metadata for X was found`). |
| Health endpoint propio | `@nestjs/terminus` | Quince líneas contra una dependencia. Se lee mejor en un repo de portfolio. |
| `class-validator` para validar el `.env` | `joi` | `class-validator` ya entra por los DTOs. Dos librerías de validación en el mismo proyecto es una inconsistencia innecesaria. |

---

## 4. Estructura del repositorio

```
sistemaDeGestion/
├─ .gitignore
├─ README.md
├─ docker-compose.yml
├─ docs/superpowers/specs/
└─ backend/
   ├─ .env                       # ignorado por git
   ├─ .env.example               # commiteado
   ├─ package.json
   ├─ tsconfig.json
   ├─ nest-cli.json
   └─ src/
      ├─ main.ts
      ├─ app.module.ts
      ├─ config/
      │  ├─ env.validation.ts
      │  └─ database.config.ts
      ├─ common/
      │  └─ transformers/
      │     └─ numeric.transformer.ts
      ├─ database/
      │  ├─ data-source.ts
      │  └─ migrations/
      ├─ modules/
      │  ├─ businesses/entities/business.entity.ts
      │  ├─ categories/entities/category.entity.ts
      │  ├─ products/entities/product.entity.ts
      │  └─ sales/entities/
      │     ├─ sale.entity.ts
      │     └─ sale-item.entity.ts
      └─ health/
         ├─ health.module.ts
         └─ health.controller.ts
```

**`docker-compose.yml` va en la raíz**, no dentro de `backend/`: es infraestructura del proyecto, no del backend, y queda visible apenas alguien abre el repo.

**Las entidades viven en `modules/<nombre>/entities/`**, no en una carpeta común. Es la convención de NestJS y evita moverlas cuando llegue el módulo que las use. `sale` y `sale_item` van juntas en `sales/` porque `sale_item` no tiene vida propia: nunca va a existir un `SaleItemsModule`.

---

## 5. Configuración y conexión

### 5.1 Variables de entorno

`backend/.env.example` (commiteado, con estos mismos valores por tratarse de una base local):

```
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=erp
DB_PASSWORD=erp_local_dev
DB_NAME=erp
```

No se agrega `JWT_SECRET` todavía: entra con el módulo de auth.

Tampoco se soporta `DATABASE_URL` por ahora. Los proveedores cloud (Neon, Railway) entregan la conexión en ese formato, así que va a hacer falta — pero se agrega cuando se haga el deploy, junto con la configuración de SSL que esos proveedores exigen. Diseñarlo ahora sin saber contra cuál se va a deployar es adivinar.

### 5.2 Validación al arranque

`env.validation.ts` define una clase con decoradores de `class-validator` (`@IsString()`, `@IsInt()`, `@IsIn(['development','production','test'])`) y se engancha en `ConfigModule.forRoot({ isGlobal: true, validate })`.

Si falta o está mal una variable, la app **no arranca**: muere en el boot con un mensaje que dice exactamente qué falta. La alternativa — arrancar igual y fallar después con un `ECONNREFUSED` genérico — manda a debuggear la conexión cuando el problema era un typo.

### 5.3 Una sola definición de conexión, dos consumidores

Este es el punto de fricción clásico de TypeORM + NestJS:

- La **app** configura la conexión por inyección de dependencias, con `TypeOrmModule.forRootAsync`.
- El **CLI de TypeORM** corre fuera de Nest, no tiene acceso al contenedor de DI, y necesita un archivo que exporte un `DataSource` ya construido.

Escribir las opciones dos veces las hace divergir — típicamente en la naming strategy — y el resultado es generar migraciones contra un esquema que no es el que la app usa.

**Solución:** `config/database.config.ts` exporta `buildDataSourceOptions(env)`, una función pura que recibe las variables ya validadas y devuelve las opciones. No sabe nada de Nest.

- `app.module.ts` la llama desde el `useFactory`, inyectando `ConfigService`.
- `database/data-source.ts` carga el `.env` con `dotenv`, lo pasa por la misma validación, llama a la misma función y exporta el `DataSource`. Es el archivo que apunta el CLI con `-d`.

Hay un solo lugar donde se decide algo, así que no pueden divergir.

### 5.4 Naming strategy

Las columnas en la base son snake_case (`business_id`, `stock_quantity`, `password_hash`); las propiedades en TypeScript son camelCase. El puente lo hace `typeorm-naming-strategies` (`SnakeNamingStrategy`), configurado una vez en `buildDataSourceOptions`.

Esto no contradice el criterio de "sin magia escondida" que motivó el filtro manual por `business_id`. Son casos distintos: el filtro manual es *opt-in por consulta* — se puede olvidar, y el olvido es un agujero de seguridad. La naming strategy es *total y determinística*: se aplica a todas las columnas, no hay caso donde se pueda olvidar, y lo peor que puede pasar si estuviera mal es que la consulta no compile. Además, treinta `name:` repetidos son ruido que tapa las decisiones que sí importan.

### 5.5 Opciones de TypeORM

| Opción | Valor | Razón |
|---|---|---|
| `synchronize` | `false`, hardcodeado | Si saliera de una variable de entorno, alguien podría ponerlo en `true` en producción. Que no exista la perilla es más seguro que confiar en no tocarla. |
| `migrationsRun` | `false` | Las migraciones corren con un comando explícito, como paso previo al start. Si corrieran al bootear, dos instancias arrancando a la vez competirían por la misma tabla. |
| `logging` | `true` en dev, `['error','warn']` en prod | Ver el SQL que TypeORM genera es la mitad de aprender un ORM, y es lo que permite detectar un N+1 o un filtro `business_id` que no llegó al `WHERE`. |
| `entities` | array explícito de imports | Los globs rompen en deploy. |
| `migrations` | glob `<dirname>/migrations/*{.ts,.js}` | Acá sí se agregan archivos todo el tiempo. El patrón con las dos extensiones funciona igual corriendo desde `src/` con ts-node que desde `dist/` compilado. |

`.env.example` se copia a `.env` en el primer setup. El `.env` real está en `.gitignore`; la contraseña de la base local no es un secreto (solo abre un contenedor descartable), así que `.env.example` lleva los valores funcionales y no placeholders.

---

## 6. Docker Compose

```yaml
services:
  db:
    image: postgres:17-alpine
    container_name: erp-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: erp
      POSTGRES_PASSWORD: erp_local_dev
      POSTGRES_DB: erp
    ports: ["5432:5432"]
    volumes: ["erp-db-data:/var/lib/postgresql/data"]

volumes:
  erp-db-data:
```

Postgres 17 porque es lo que hoy dan por defecto Neon y Supabase: desarrollar contra la misma major que va a correr en producción evita sorpresas. Al elegir proveedor se confirma la versión exacta.

El volumen con nombre hace que los datos sobrevivan a `docker compose down`. Para borrar todo y arrancar limpio: `docker compose down -v`.

---

## 7. Scripts de npm y flujo de migraciones

```json
"typeorm": "typeorm-ts-node-commonjs -d src/database/data-source.ts",
"migration:generate": "npm run typeorm -- migration:generate",
"migration:create": "npm run typeorm -- migration:create",
"migration:run": "npm run typeorm -- migration:run",
"migration:revert": "npm run typeorm -- migration:revert",
"migration:show": "npm run typeorm -- migration:show"
```

El nombre de la migración va como argumento al final, no por variable de entorno: la expansión de variables en scripts de npm no funciona igual en PowerShell que en bash, y en Windows el error resultante es críptico.

```bash
npm run migration:generate -- src/database/migrations/InitialSchema
```

### Ciclo de trabajo

1. Escribir o modificar la entidad.
2. Correr `migration:generate`.
3. **Abrir el archivo generado y leer el SQL.** TypeORM infiere, y a veces infiere mal — sobre todo con índices parciales y cambios de tipo, donde puede resolver un `ALTER` como drop + create y llevarse los datos puestos. Este paso no es opcional.
4. `migration:run`, y commitear la migración junto con la entidad, en el mismo commit.

### Reglas

- La estructura de la base local **solo** se toca con migraciones, nunca a mano. Un `ALTER` manual crea deriva silenciosa y hace que la próxima migración generada salga incompleta.
- Correr todas las migraciones pendientes **antes** de generar una nueva. Si hay una escrita y sin aplicar, `generate` no la ve y duplica sus cambios.
- Una migración ya commiteada **no se edita nunca**. Se corrige con una migración nueva. En las bases donde ya corrió, su nombre está en la tabla `migrations` y no se vuelve a mirar; editar el archivo solo afectaría a las bases nuevas, produciendo dos bases que corrieron "la misma" migración con contenido distinto.

---

## 8. Modelo de datos

### 8.1 Patrón transversal de foreign keys

Cada entidad expone la FK **como columna escalar y como relación**:

```ts
@Column({ type: 'uuid' })
businessId: string;

@ManyToOne(() => Business, { nullable: false })
@JoinColumn({ name: 'business_id' })
business: Business;
```

Esto es lo que habilita el filtro manual multi-tenant: permite `where: { businessId }` sin cargar la relación ni hacer un join. Si solo existiera el objeto `business`, cada consulta filtrada tendría que ir por `where: { business: { id } }`, generando un join innecesario en todas las lecturas del sistema.

Las relaciones inversas (`@OneToMany`) van solo donde se usan: `Sale.items`, porque el alta de una venta inserta la venta y sus ítems juntos. `Business.products` no existe — los productos siempre se consultan filtrando por `businessId`, nunca colgando de un negocio.

### 8.2 Tipo de los montos

`price`, `cost`, `total`, `unitPrice` y `subtotal` van como `decimal(12,2)`: exacto, sin error de punto flotante, hasta 9.999.999.999,99.

El driver `pg` devuelve `decimal` como **string**, no como number. Es correcto de su parte (un `decimal` de Postgres puede exceder la precisión de un `number` de JS), pero produce bugs silenciosos: `"15000.00" + 100` da `"15000.00100"`.

Se resuelve con un **transformer numérico compartido** en `common/transformers/numeric.transformer.ts`, aplicado en las cinco columnas de dinero: convierte a `number` al leer, deja pasar al escribir. Así el tipo de TypeScript no miente.

La aritmética de la venta (`subtotal = unitPrice * quantity`, `total = suma de subtotales`) se hace en JS con esos números, redondeando a dos decimales al calcular el total en lugar de dejarlo librado a lo que Postgres trunque al guardar.

### 8.3 Fechas

Todas las columnas de fecha van en **`timestamptz`**, no `timestamp`. Guarda el instante real, así que no importa que el server de producción corra en UTC y el negocio esté en UTC-3.

Consecuencia a tener presente cuando se implemente el dashboard: el corte de "ventas del mes" hay que calcularlo convirtiendo a `America/Argentina/Buenos_Aires`, porque una venta del 31 a las 22:00 hora argentina cae el día 1 del mes siguiente en UTC. Es un problema del dashboard, no de este entregable, pero `timestamptz` es lo que permite resolverlo bien.

### 8.4 Entidades

**`Business`** → tabla `businesses`

| Propiedad | Columna | Tipo | Notas |
|---|---|---|---|
| `id` | `id` | uuid PK | |
| `name` | `name` | varchar(120) | |
| `email` | `email` | varchar(180) | `UNIQUE` |
| `passwordHash` | `password_hash` | varchar(255) | `select: false` |
| `createdAt` | `created_at` | timestamptz | `@CreateDateColumn` |

`select: false` en `passwordHash` hace que la columna no venga en los `find()` salvo que se pida explícitamente con `addSelect`. Convierte "me olvidé de sacar el hash de la respuesta" de un error posible en uno que hay que escribir a propósito. El único lugar que lo va a pedir es el login.

**`Category`** → tabla `categories`

| Propiedad | Columna | Tipo | Notas |
|---|---|---|---|
| `id` | `id` | uuid PK | |
| `businessId` | `business_id` | uuid FK → businesses | |
| `name` | `name` | varchar(80) | |

**`Product`** → tabla `products`

| Propiedad | Columna | Tipo | Notas |
|---|---|---|---|
| `id` | `id` | uuid PK | |
| `businessId` | `business_id` | uuid FK → businesses | |
| `categoryId` | `category_id` | uuid FK → categories | nullable |
| `name` | `name` | varchar(150) | |
| `sku` | `sku` | varchar(60) | |
| `price` | `price` | decimal(12,2) | transformer numérico |
| `cost` | `cost` | decimal(12,2) | nullable, transformer numérico |
| `stockQuantity` | `stock_quantity` | int | default 0, puede ser negativo |
| `lowStockThreshold` | `low_stock_threshold` | int | default 0 |
| `active` | `active` | boolean | default `true` |
| `createdAt` | `created_at` | timestamptz | |

`stockQuantity` **no** lleva un `CHECK (stock_quantity >= 0)`: el negocio vende por tres canales, el sistema nunca es la única fuente de verdad, y un stock negativo es información válida y útil, no un error.

**`Sale`** → tabla `sales`

| Propiedad | Columna | Tipo | Notas |
|---|---|---|---|
| `id` | `id` | uuid PK | |
| `businessId` | `business_id` | uuid FK → businesses | |
| `total` | `total` | decimal(12,2) | transformer numérico |
| `createdAt` | `created_at` | timestamptz | |
| `items` | — | `@OneToMany` → SaleItem | `cascade: ['insert']` |

**`SaleItem`** → tabla `sale_items`

| Propiedad | Columna | Tipo | Notas |
|---|---|---|---|
| `id` | `id` | uuid PK | |
| `saleId` | `sale_id` | uuid FK → sales | `ON DELETE CASCADE` |
| `productId` | `product_id` | uuid FK → products | |
| `quantity` | `quantity` | int | |
| `unitPrice` | `unit_price` | decimal(12,2) | snapshot del precio, transformer numérico |
| `subtotal` | `subtotal` | decimal(12,2) | transformer numérico |

`sale_items` **no lleva `business_id`**, tal como se diseñó originalmente: se llega por `sale`, y duplicarlo sería un dato que puede quedar inconsistente con su venta.

### 8.5 Índices

| Tabla | Índice | Función |
|---|---|---|
| `businesses` | `UNIQUE (email)` | Credencial de login, global. |
| `categories` | `(business_id)` | Filtro de todas las consultas. |
| `categories` | `UNIQUE (business_id, lower(name))` | Unicidad case-insensitive. |
| `products` | `(business_id)` | Filtro de todas las consultas. |
| `products` | `UNIQUE (business_id, sku) WHERE active = true` | SKU único entre productos activos. |
| `sales` | `(business_id, created_at)` | Filtro por negocio y rango de fechas. |
| `sale_items` | `(sale_id)` | Traer los ítems de una venta. |

### 8.6 Cambios respecto del diseño original de base

Cuatro desvíos, todos revisados y aprobados:

1. **`UNIQUE` funcional sobre `lower(name)` en `categories`**, en vez de un `UNIQUE` común sobre `(business_id, name)`. La razón original para hacer `categories` una tabla propia fue evitar "Ropa" / "ropa" / "Ropa ", y un unique común no lo logra: para Postgres `'Ropa'` y `'ropa'` son valores distintos y entran los dos. Se complementa con un `.trim()` en el service para el espacio final.

2. **Índice compuesto `(business_id, created_at)` en `sales`**, en vez de solo `(business_id)`. Postgres puede usar el prefijo izquierdo, así que sirve igual para el filtro simple por negocio, y además cubre "ventas del mes" sin ordenar en memoria. Mismo costo, más alcance.

3. **Índice en `sale_items(sale_id)`**. Postgres crea índices automáticamente para primary keys y `UNIQUE`, pero **no** para foreign keys (a diferencia de MySQL). Sin este índice, traer los ítems de una venta escanea toda la tabla `sale_items`.

4. **`passwordHash` con `select: false`**, explicado en 8.4.

Además, dos campos pasan a **nullable**: `categoryId` en productos, para no obligar a crear una categoría antes de cargar el primer producto; y `cost`, porque un negocio chico no siempre tiene el costo cargado y un `0` mentiría en el cálculo de margen.

---

## 9. Migración inicial

Una sola migración para todo el esquema. No tiene sentido partirla: no hay datos previos que preservar.

Se genera con `migration:generate`, se lee y se corrige a mano donde haga falta. Dos puntos a revisar específicamente en el SQL generado:

- **Generación de UUIDs.** Según la versión, TypeORM puede emitir `uuid_generate_v4()` junto con un `CREATE EXTENSION "uuid-ossp"`. Postgres 13+ ya trae `gen_random_uuid()` nativo, sin extensión. Si sale con la extensión, se cambia a `gen_random_uuid()`: una dependencia menos que tiene que existir en la base de producción.
- **El índice parcial y el funcional.** Son los dos casos donde TypeORM es menos confiable. Si no los genera correctamente, se escriben a mano con `queryRunner.query(...)`, con su `DROP INDEX` correspondiente en el `down()`.

Todas las migraciones llevan un `down()` correcto, aunque en producción la estrategia real frente a un problema sea siempre arreglar hacia adelante con una migración nueva (revertir suele implicar pérdida de datos). El `down()` se usa y se agradece en desarrollo.

---

## 10. Health endpoint

`GET /health`:

- `200 { "status": "ok", "database": "up" }` si `SELECT 1` responde.
- `503 { "status": "error", "database": "down" }` si falla.

Implementado como un controller propio que inyecta el `DataSource`. Quince líneas, sin dependencias adicionales.

**Anotado para el futuro:** cuando entre el `JwtAuthGuard` global vía `APP_GUARD`, este endpoint necesita el decorador `@Public()` o va a empezar a devolver 401. Es exactamente el tipo de olvido que la decisión de "guard global" hace evidente enseguida.

---

## 11. Verificación

Manual, en este orden:

1. `docker compose up -d` — Docker Desktop tiene que estar corriendo.
2. `npm install` en `backend/`.
3. `npm run migration:run` — la migración impacta sin errores.
4. `npm run migration:show` — la migración figura como aplicada.
5. `npm run start:dev` — la app arranca.
6. `GET /health` devuelve 200.
7. Inspección de `products` y `categories` con `psql` dentro del contenedor — los índices existen tal como se diseñaron. Que TypeORM haya generado el SQL no prueba que Postgres lo haya aceptado como se esperaba.
8. Prueba negativa: parar el contenedor de la base y confirmar que `/health` devuelve 503 en lugar de colgarse o tirar un 500 sin forma.

---

## 12. Testing

**No se escriben tests automáticos en este entregable.** Es una decisión explícita, no una omisión: no hay lógica propia que testear — la conexión y las migraciones o funcionan o la app no arranca — y un test de "la entidad mapea correctamente" solo estaría testeando a TypeORM.

La estrategia de testing del proyecto se define en el spec del MVP, cuando entre auth. Ahí el valor es concreto y medible: los tests e2e de aislamiento por `business_id` son la red de contención que compensa haber elegido el filtro manual por sobre un repositorio base automático.

---

## 13. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| TypeORM genera mal el índice parcial o el funcional | Se revisa el SQL generado; si está mal se escribe a mano con `queryRunner.query()`. El paso 7 de la verificación lo confirma contra la base real. |
| El CLI de TypeORM y la app divergen en configuración | Una única `buildDataSourceOptions()` consumida por ambos. |
| Docker Desktop no está corriendo al empezar a trabajar | Documentado en el README como primer paso. |
| La versión de Postgres local difiere de la de producción | Se elige 17 por ser el default de Neon y Supabase; se confirma al momento del deploy. |

---

## 14. Próximos pasos

Fuera de este entregable, en orden sugerido:

1. **Auth** — registro y login de negocios, JWT, `JwtAuthGuard` global, `@Public()`, `@CurrentBusiness()`, y el andamiaje de errores (`AppException`, exception filter, `exceptionFactory`). Acá se define también la estrategia de testing.
2. **Productos y categorías** — CRUD con filtro manual por `business_id` y soft delete.
3. **Ventas** — `POST /sales` con validación de pertenencia, transacción, precio snapshot, descuento de stock y `warnings` con `NEGATIVE_STOCK`.
4. **Dashboard** — total vendido, stock bajo, ventas del mes.
5. **Frontend Angular**.
6. **Deploy** — soporte de `DATABASE_URL` y SSL, migraciones como paso de deploy.

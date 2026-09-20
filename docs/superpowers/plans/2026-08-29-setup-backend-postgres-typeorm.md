# Setup del backend y conexión a PostgreSQL — Plan de Implementación

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Dejar un backend NestJS que arranca, se conecta a PostgreSQL vía TypeORM, tiene las cinco entidades del modelo mapeadas y el esquema creado por una migración versionada.

**Architecture:** Monorepo con `backend/` en la raíz del repo. PostgreSQL corre en un contenedor Docker. La configuración de conexión se construye en una única función pura (`buildDataSourceOptions`) consumida tanto por el `TypeOrmModule` de Nest como por el `DataSource` standalone que necesita el CLI de TypeORM, para que no puedan divergir. El esquema se crea exclusivamente con migraciones (`synchronize: false`).

**Tech Stack:** NestJS 11, TypeORM 0.3.x, PostgreSQL 18 (Docker), TypeScript, `class-validator`, `typeorm-naming-strategies`.

**Spec:** [`docs/superpowers/specs/2026-08-28-setup-backend-postgres-typeorm-design.md`](../specs/2026-08-28-setup-backend-postgres-typeorm-design.md)

## Global Constraints

Estas reglas aplican a **todas** las tareas. No se repiten en cada una.

- **`synchronize: false` siempre**, hardcodeado, nunca leído de una variable de entorno.
- **`migrationsRun: false`**. Las migraciones corren con un comando explícito.
- **El esquema de la base local solo se toca con migraciones**, nunca con SQL manual contra la base.
- **Puerto del host: `5433`**, no 5432. La máquina de desarrollo tiene PostgreSQL 18 corriendo como servicio de Windows (`postgresql-x64-18`) que ya ocupa el 5432.
- **Imagen de Docker: `postgres:18-alpine`**.
- **Todas las columnas de fecha van en `timestamptz`**, nunca `timestamp`.
- **Todas las columnas de dinero van en `decimal(12,2)` con el transformer numérico compartido.** Sin excepción: `price`, `cost`, `total`, `unitPrice`, `subtotal`.
- **Las entidades se listan explícitamente** en el array `entities`. Nunca por glob.
- **Naming strategy:** `SnakeNamingStrategy`. No se escriben `@Column({ name: '...' })` manuales.
- **No se escriben tests automáticos** en este entregable (decisión del spec §12). Cada tarea cierra con una verificación manual de salida verificable.
- **Docker Desktop tiene que estar corriendo** antes de cualquier tarea que toque la base.
- **Comandos `curl`:** usar `curl.exe` y no `curl`. En PowerShell, `curl` es un alias de `Invoke-WebRequest` y no acepta los mismos flags; `curl.exe` invoca el binario real en PowerShell y en Git Bash por igual.
- **Todos los comandos `npm run ...` se ejecutan desde `backend/`**, salvo los de `docker compose`, que van desde la raíz del repo.

---

## Estructura de archivos

Qué se crea y de qué es responsable cada archivo:

| Archivo | Responsabilidad |
|---|---|
| `.gitattributes` | Normaliza finales de línea entre Windows y Linux. |
| `docker-compose.yml` | Define el contenedor de PostgreSQL y su volumen. |
| `README.md` | Cómo levantar el proyecto desde cero. |
| `backend/.env.example` | Plantilla de variables de entorno, commiteada. |
| `backend/src/config/env.validation.ts` | Define y valida la forma del entorno. Falla el arranque si falta algo. |
| `backend/src/config/database.config.ts` | Única fuente de las opciones de conexión de TypeORM. |
| `backend/src/common/transformers/numeric.transformer.ts` | Convierte `decimal` de Postgres (que llega como string) a `number`. |
| `backend/src/database/data-source.ts` | `DataSource` standalone para el CLI de TypeORM. |
| `backend/src/database/migrations/` | Migraciones versionadas. |
| `backend/src/modules/*/entities/*.entity.ts` | Una entidad por archivo, agrupadas por módulo futuro. |
| `backend/src/health/health.controller.ts` | Endpoint que verifica que la conexión a la base vive. |
| `backend/src/app.module.ts` | Compone `ConfigModule`, `TypeOrmModule` y `HealthModule`. |

---

## Task 1: Repositorio base y contenedor de PostgreSQL

**Files:**
- Create: `.gitattributes`
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: nada.
- Produces: una base PostgreSQL accesible en `localhost:5433`, con usuario `erp`, contraseña `erp_local_dev` y base `erp`.

- [ ] **Step 1: Crear `.gitattributes` en la raíz del repo**

```gitattributes
# Normaliza a LF en el repositorio; cada checkout usa lo que corresponda al SO.
* text=auto eol=lf

# Scripts de Windows: tienen que quedar en CRLF o el shell los rechaza.
*.ps1 text eol=crlf
*.cmd text eol=crlf
*.bat text eol=crlf

# Binarios: git no los debe tocar nunca.
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.pdf binary
```

- [ ] **Step 2: Crear `docker-compose.yml` en la raíz del repo**

```yaml
services:
  db:
    image: postgres:18-alpine
    container_name: erp-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: erp
      POSTGRES_PASSWORD: erp_local_dev
      POSTGRES_DB: erp
    # 5433 en el host: el 5432 lo ocupa el PostgreSQL nativo de Windows.
    ports: ["5433:5432"]
    # Postgres 18+ espera UN montaje en /var/lib/postgresql y crea adentro un
    # subdirectorio por version mayor. El path clasico /var/lib/postgresql/data
    # (valido hasta la 17) hace que la imagen se niegue a arrancar.
    volumes: ["erp-db-data:/var/lib/postgresql"]

volumes:
  erp-db-data:
```

- [ ] **Step 3: Levantar el contenedor**

Requiere Docker Desktop abierto.

```bash
docker compose up -d
```

Esperado: `Container erp-db  Started`. La primera vez descarga la imagen, lo que tarda un minuto o dos.

- [ ] **Step 4: Verificar que la base responde y es la versión correcta**

```bash
docker compose exec db psql -U erp -d erp -c "SELECT version();"
```

Esperado: una línea que empieza con `PostgreSQL 18.` — confirma que el contenedor está sano y que `psql` entra sin pedir contraseña.

- [ ] **Step 5: Verificar que no hay choque de puertos**

```bash
docker compose ps
```

Esperado: la columna `PORTS` muestra `0.0.0.0:5433->5432/tcp`, y `STATUS` dice `Up N seconds` con N creciendo entre corridas del comando.

Si `STATUS` muestra `Up Less than a second` cada vez, el contenedor está en loop de reinicio: leer `docker compose logs db`. La causa más probable es el montaje del volumen (ver el comentario en el `docker-compose.yml`).

Si el paso 3 falló con `port is already allocated`, el mapeo quedó en 5432 — revisar el `docker-compose.yml`.

- [ ] **Step 6: Commit**

```bash
git add .gitattributes docker-compose.yml
git commit -m "chore: contenedor de PostgreSQL y normalizacion de fin de linea"
```

---

## Task 2: Scaffold de NestJS y validación de entorno

**Files:**
- Create: `backend/` (scaffold completo del CLI de Nest)
- Create: `backend/.env.example`
- Create: `backend/.env` (no se commitea)
- Create: `backend/src/config/env.validation.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/main.ts`
- Delete: `backend/src/app.controller.ts`, `backend/src/app.service.ts`, `backend/src/app.controller.spec.ts`, `backend/test/`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `EnvVars` — clase con las propiedades `NODE_ENV: NodeEnv`, `PORT: number`, `DB_HOST: string`, `DB_PORT: number`, `DB_USERNAME: string`, `DB_PASSWORD: string`, `DB_NAME: string`.
  - `validateEnv(config: Record<string, unknown>): EnvVars` — valida y devuelve la instancia tipada; lanza `Error` si algo falta o está mal.
  - `envFromConfigService(config: ConfigService): EnvVars` — arma un `EnvVars` desde el `ConfigService` de Nest.
  - `enum NodeEnv { Development = 'development', Production = 'production', Test = 'test' }`

- [ ] **Step 1: Scaffoldear el backend**

Desde la raíz del repo. El `--skip-git` es obligatorio: el repositorio ya existe en la raíz y no queremos uno anidado.

```bash
npx @nestjs/cli@latest new backend --package-manager npm --skip-git
```

- [ ] **Step 2: Instalar las dependencias del proyecto**

```bash
cd backend && npm install @nestjs/config @nestjs/typeorm typeorm pg class-validator class-transformer typeorm-naming-strategies dotenv
cd backend && npm install -D ts-node @types/express
```

`dotenv` se instala explícitamente aunque `@nestjs/config` lo traiga: `data-source.ts` corre fuera de Nest y lo usa directo, y depender de una dependencia transitiva es frágil.

- [ ] **Step 3: Borrar el boilerplate que no se usa**

El diseño no tiene `AppController` ni `AppService` — el primer endpoint es `/health`, que vive en su propio módulo.

```bash
rm backend/src/app.controller.ts backend/src/app.service.ts backend/src/app.controller.spec.ts
rm -rf backend/test
```

- [ ] **Step 4: Crear `backend/.env.example`**

```
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=erp
DB_PASSWORD=erp_local_dev
DB_NAME=erp
```

- [ ] **Step 5: Crear el `.env` real copiándolo**

```bash
cp backend/.env.example backend/.env
```

Los valores son idénticos: la contraseña de la base local no es un secreto, solo abre un contenedor descartable. El `.env` igual está en `.gitignore` porque cuando llegue `JWT_SECRET` sí va a importar.

- [ ] **Step 6: Crear `backend/src/config/env.validation.ts`**

```ts
import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import { ConfigService } from '@nestjs/config';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME: string;
}

/**
 * Valida el entorno y devuelve la instancia tipada.
 * Lanza si falta o esta mal una variable: preferimos morir en el arranque
 * con un mensaje claro antes que fallar despues con un ECONNREFUSED generico.
 */
export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config);

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detail = errors
      .map(
        (error) =>
          `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n');

    throw new Error(`Invalid environment variables:\n${detail}`);
  }

  return validated;
}

/** Arma un EnvVars desde el ConfigService de Nest, ya validado en el arranque. */
export function envFromConfigService(config: ConfigService): EnvVars {
  return {
    NODE_ENV: config.getOrThrow<NodeEnv>('NODE_ENV'),
    PORT: Number(config.getOrThrow('PORT')),
    DB_HOST: config.getOrThrow<string>('DB_HOST'),
    DB_PORT: Number(config.getOrThrow('DB_PORT')),
    DB_USERNAME: config.getOrThrow<string>('DB_USERNAME'),
    DB_PASSWORD: config.getOrThrow<string>('DB_PASSWORD'),
    DB_NAME: config.getOrThrow<string>('DB_NAME'),
  };
}
```

- [ ] **Step 7: Reemplazar `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Reemplazar `backend/src/main.ts`**

```ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.getOrThrow('PORT'));

  await app.listen(port);
  console.log(`Backend escuchando en http://localhost:${port}`);
}

void bootstrap();
```

- [ ] **Step 9: Verificar que la app arranca**

```bash
cd backend && npm run start:dev
```

Esperado: `Backend escuchando en http://localhost:3000`, sin errores. Cortar con `Ctrl+C`.

- [ ] **Step 10: Verificar que la validación de entorno realmente frena el arranque**

Este es el paso que prueba que la validación sirve. Sin él, un `validateEnv` roto pasaría desapercibido.

Comentar temporalmente la línea `DB_PASSWORD=erp_local_dev` en `backend/.env` (anteponerle un `#`) y arrancar:

```bash
cd backend && npm run start:dev
```

Esperado: la app **no** arranca, y el error dice:

```
Invalid environment variables:
  - DB_PASSWORD: DB_PASSWORD should not be empty, DB_PASSWORD must be a string
```

Descomentar la línea y confirmar que vuelve a arrancar.

- [ ] **Step 11: Commit**

```bash
git add backend/
git commit -m "feat: scaffold del backend NestJS con validacion de entorno"
```

Confirmar con `git status` que `backend/.env` **no** entró en el commit. Si aparece, el `.gitignore` de la raíz no lo está cubriendo y hay que arreglarlo antes de seguir.

---

## Task 3: Conexión a PostgreSQL con TypeORM

**Files:**
- Create: `backend/src/common/transformers/numeric.transformer.ts`
- Create: `backend/src/config/database.config.ts`
- Create: `backend/src/database/data-source.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/package.json` (scripts)

**Interfaces:**
- Consumes: `EnvVars`, `validateEnv`, `envFromConfigService` (Task 2).
- Produces:
  - `numericTransformer: ValueTransformer` — para las columnas `decimal`.
  - `buildDataSourceOptions(env: EnvVars): DataSourceOptions` — única fuente de las opciones de conexión.
  - `backend/src/database/data-source.ts` con `export default` de un `DataSource` — es lo que consume el CLI de TypeORM vía `-d`.
  - Scripts npm `migration:generate`, `migration:create`, `migration:run`, `migration:revert`, `migration:show`.

- [ ] **Step 1: Crear `backend/src/common/transformers/numeric.transformer.ts`**

```ts
import { ValueTransformer } from 'typeorm';

/**
 * El driver `pg` devuelve las columnas `decimal` como string, no como number
 * (un decimal de Postgres puede exceder la precision de un number de JS).
 * Sin esto, "15000.00" + 100 devuelve "15000.00100" y el bug es silencioso.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | null): number | null =>
    value === null ? null : Number(value),
};
```

- [ ] **Step 2: Crear `backend/src/config/database.config.ts`**

El array `entities` arranca vacío y se va llenando en las tareas 5, 6 y 7.

```ts
import { join } from 'path';
import { DataSourceOptions, LoggerOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { EnvVars, NodeEnv } from './env.validation';

/**
 * Unica fuente de las opciones de conexion. La consumen dos lugares:
 * el TypeOrmModule de Nest (via useFactory) y el DataSource standalone
 * que necesita el CLI de TypeORM. Si estuvieran duplicadas divergirian,
 * y las migraciones se generarian contra un esquema distinto al que usa la app.
 */
export function buildDataSourceOptions(env: EnvVars): DataSourceOptions {
  const logging: LoggerOptions =
    env.NODE_ENV === NodeEnv.Development ? true : ['error', 'warn'];

  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,

    // Explicitas, nunca por glob: los globs rompen en deploy con un
    // "No metadata for X was found" dificil de diagnosticar.
    entities: [],

    // Aca si va glob: se agregan archivos todo el tiempo, y el patron
    // con las dos extensiones funciona igual desde src/ que desde dist/.
    migrations: [join(__dirname, '..', 'database', 'migrations', '*{.ts,.js}')],

    namingStrategy: new SnakeNamingStrategy(),

    // Hardcodeados a proposito: si salieran del entorno, alguien podria
    // encender synchronize en produccion.
    synchronize: false,
    migrationsRun: false,

    logging,
  };
}
```

- [ ] **Step 3: Crear `backend/src/database/data-source.ts`**

```ts
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../config/database.config';
import { validateEnv } from '../config/env.validation';

// El CLI de TypeORM corre fuera de Nest: no hay ConfigModule que cargue el .env.
loadEnv();

const env = validateEnv(process.env);

export default new DataSource(buildDataSourceOptions(env));
```

- [ ] **Step 4: Enganchar TypeORM en `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { buildDataSourceOptions } from './config/database.config';
import { envFromConfigService, validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildDataSourceOptions(envFromConfigService(config)),
    }),
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Agregar los scripts de migración a `backend/package.json`**

Dentro del objeto `"scripts"`, junto a los que ya generó Nest:

```json
"typeorm": "typeorm-ts-node-commonjs -d src/database/data-source.ts",
"migration:generate": "npm run typeorm -- migration:generate",
"migration:create": "npm run typeorm -- migration:create",
"migration:run": "npm run typeorm -- migration:run",
"migration:revert": "npm run typeorm -- migration:revert",
"migration:show": "npm run typeorm -- migration:show"
```

El nombre de la migración se pasa como argumento al final, no por variable de entorno: la expansión de variables en scripts de npm no funciona igual en PowerShell que en bash.

- [ ] **Step 6: Verificar que la app se conecta a la base**

Con el contenedor levantado (`docker compose ps` debe mostrar `erp-db` en `running`):

```bash
cd backend && npm run start:dev
```

Esperado: arranca sin errores. Con `logging: true` en desarrollo se ven las consultas de arranque de TypeORM en la consola. **No** debe aparecer `ECONNREFUSED` ni `password authentication failed`. Cortar con `Ctrl+C`.

- [ ] **Step 7: Verificar que el CLI de TypeORM también se conecta**

Este paso prueba el segundo consumidor de `buildDataSourceOptions`, que es la mitad del punto de esta tarea.

```bash
cd backend && npm run migration:show
```

Esperado: termina sin error y no lista ninguna migración (todavía no hay). Si tira `Unable to open file` o `No connection options were found`, el path del `-d` en el script `typeorm` está mal.

- [ ] **Step 8: Commit**

```bash
git add backend/src backend/package.json backend/package-lock.json
git commit -m "feat: conexion a PostgreSQL con TypeORM compartida entre app y CLI"
```

---

## Task 4: Endpoint de health

**Files:**
- Create: `backend/src/health/health.controller.ts`
- Create: `backend/src/health/health.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: el `DataSource` inyectable que registra `TypeOrmModule.forRootAsync` (Task 3).
- Produces: `GET /health` → `200 { "status": "ok", "database": "up" }` o `503 { "status": "error", "database": "down" }`.

- [ ] **Step 1: Crear `backend/src/health/health.controller.ts`**

```ts
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // TODO al sumar auth: este endpoint necesita @Public(), o el
  // JwtAuthGuard global lo va a empezar a responder con 401.
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', database: 'down' };
    }
  }
}
```

`@Res({ passthrough: true })` deja fijar el status sin salirse del pipeline de respuesta de Nest. Se usa en vez de lanzar una excepción para que el cuerpo de la respuesta sea exactamente este y no quede sujeto al exception filter global cuando ese llegue: el health no debería viajar dentro del sobre de errores de la aplicación.

- [ ] **Step 2: Crear `backend/src/health/health.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 3: Registrar `HealthModule` en `backend/src/app.module.ts`**

Agregar el import y sumarlo al array `imports`, después de `TypeOrmModule.forRootAsync`:

```ts
import { HealthModule } from './health/health.module';
```

```ts
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildDataSourceOptions(envFromConfigService(config)),
    }),
    HealthModule,
```

- [ ] **Step 4: Verificar el camino feliz**

Con la app corriendo (`npm run start:dev` en otra terminal):

```bash
curl.exe -i http://localhost:3000/health
```

Esperado: `HTTP/1.1 200 OK` y el cuerpo `{"status":"ok","database":"up"}`.

- [ ] **Step 5: Verificar el camino de error**

Este paso es el que da valor al endpoint: sin él, no sabemos si detecta algo o siempre dice que sí.

Dejando la app corriendo, desde la raíz del repo:

```bash
docker compose stop db
curl.exe -i http://localhost:3000/health
```

Esperado: `HTTP/1.1 503 Service Unavailable` y el cuerpo `{"status":"error","database":"down"}`. La app **no** debe crashear.

Volver a levantar la base y confirmar que se recupera sola:

```bash
docker compose start db
curl.exe -i http://localhost:3000/health
```

Esperado: `200` otra vez.

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "feat: endpoint /health que verifica la conexion a la base"
```

---

## Task 5: Entidades Business y Category

**Files:**
- Create: `backend/src/modules/businesses/entities/business.entity.ts`
- Create: `backend/src/modules/categories/entities/category.entity.ts`
- Modify: `backend/src/config/database.config.ts`

**Interfaces:**
- Consumes: nada de las tareas anteriores más allá de la conexión.
- Produces: clases `Business` y `Category`. `Business` es el destino de la FK `businessId` en todas las demás entidades.

- [ ] **Step 1: Crear `backend/src/modules/businesses/entities/business.entity.ts`**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 180, unique: true })
  email: string;

  /**
   * select: false — la columna no viene en los find() salvo que se pida
   * con addSelect. Convierte "me olvide de sacar el hash de la respuesta"
   * en un error que hay que escribir a proposito. Solo el login lo pide.
   */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 2: Crear `backend/src/modules/categories/entities/category.entity.ts`**

```ts
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Business } from '../../businesses/entities/business.entity';

/**
 * El UNIQUE funcional sobre (business_id, lower(name)) no se puede expresar
 * con decoradores de TypeORM: se crea a mano en la migracion inicial (Task 8).
 */
@Entity('categories')
@Index(['businessId'])
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // La FK va como columna escalar Y como relacion: la escalar es la que
  // habilita where: { businessId } sin generar un join en cada lectura.
  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { nullable: false })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'varchar', length: 80 })
  name: string;
}
```

- [ ] **Step 3: Registrar las entidades en `backend/src/config/database.config.ts`**

Agregar los imports arriba:

```ts
import { Business } from '../modules/businesses/entities/business.entity';
import { Category } from '../modules/categories/entities/category.entity';
```

Y reemplazar `entities: [],` por:

```ts
    entities: [Business, Category],
```

- [ ] **Step 4: Verificar que la metadata es válida**

TypeORM valida las relaciones y decoradores al construir el `DataSource`. Si una entidad está mal declarada, la app no arranca — así que el arranque **es** la verificación.

```bash
cd backend && npm run start:dev
```

Esperado: arranca sin errores. Cortar con `Ctrl+C`.

Si aparece `Entity metadata for Category#business was not found`, la entidad no quedó registrada en el array `entities`.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat: entidades Business y Category"
```

---

## Task 6: Entidad Product

**Files:**
- Create: `backend/src/modules/products/entities/product.entity.ts`
- Modify: `backend/src/config/database.config.ts`

**Interfaces:**
- Consumes: `Business` y `Category` (Task 5), `numericTransformer` (Task 3).
- Produces: clase `Product`, destino de la FK `productId` en `SaleItem` (Task 7).

- [ ] **Step 1: Crear `backend/src/modules/products/entities/product.entity.ts`**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { Business } from '../../businesses/entities/business.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('products')
@Index(['businessId'])
// Parcial: un SKU de un producto desactivado no bloquea el alta de uno nuevo
// con el mismo codigo. Verificar en el SQL generado que el WHERE sobrevivio.
@Index(['businessId', 'sku'], { unique: true, where: 'active = true' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { nullable: false })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  // Nullable para no obligar a crear una categoria antes del primer producto.
  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 60 })
  sku: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  price: number;

  // Nullable: un negocio chico no siempre tiene el costo cargado,
  // y un 0 mentiria en el calculo de margen.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  cost: number | null;

  // Sin CHECK (>= 0) a proposito: el negocio vende por tres canales, el
  // sistema no es la unica fuente de verdad, y un stock negativo es
  // informacion valida (hubo venta por otro canal o error de carga inicial).
  @Column({ type: 'int', default: 0 })
  stockQuantity: number;

  @Column({ type: 'int', default: 0 })
  lowStockThreshold: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 2: Registrar la entidad en `backend/src/config/database.config.ts`**

Agregar el import:

```ts
import { Product } from '../modules/products/entities/product.entity';
```

Y actualizar el array:

```ts
    entities: [Business, Category, Product],
```

- [ ] **Step 3: Verificar que la metadata es válida**

```bash
cd backend && npm run start:dev
```

Esperado: arranca sin errores. Cortar con `Ctrl+C`.

- [ ] **Step 4: Commit**

```bash
git add backend/src
git commit -m "feat: entidad Product con indice parcial de SKU"
```

---

## Task 7: Entidades Sale y SaleItem

**Files:**
- Create: `backend/src/modules/sales/entities/sale.entity.ts`
- Create: `backend/src/modules/sales/entities/sale-item.entity.ts`
- Modify: `backend/src/config/database.config.ts`

**Interfaces:**
- Consumes: `Business` (Task 5), `Product` (Task 6), `numericTransformer` (Task 3).
- Produces: clases `Sale` y `SaleItem`. `Sale.items: SaleItem[]` con `cascade: ['insert']` es lo que va a permitir insertar la venta y sus ítems en una sola operación cuando se implemente `POST /sales`.

- [ ] **Step 1: Crear `backend/src/modules/sales/entities/sale.entity.ts`**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { Business } from '../../businesses/entities/business.entity';
import { SaleItem } from './sale-item.entity';

@Entity('sales')
// Compuesto: sirve para el filtro simple por negocio (prefijo izquierdo)
// y ademas cubre "ventas del mes" sin ordenar en memoria.
@Index(['businessId', 'createdAt'])
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { nullable: false })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  total: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: ['insert'] })
  items: SaleItem[];
}
```

- [ ] **Step 2: Crear `backend/src/modules/sales/entities/sale-item.entity.ts`**

```ts
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { Product } from '../../products/entities/product.entity';
import { Sale } from './sale.entity';

/**
 * No lleva business_id a proposito: se llega por sale, y duplicarlo seria
 * un dato que puede quedar inconsistente con su venta.
 */
@Entity('sale_items')
// Postgres NO indexa las foreign keys automaticamente (a diferencia de MySQL):
// sin esto, traer los items de una venta escanea toda la tabla.
@Index(['saleId'])
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  saleId: string;

  @ManyToOne(() => Sale, (sale) => sale.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'int' })
  quantity: number;

  // Snapshot del precio al momento de la venta: NO se calcula desde
  // products.price, para que un cambio de precio no altere el historico.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  unitPrice: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  subtotal: number;
}
```

- [ ] **Step 3: Registrar las entidades en `backend/src/config/database.config.ts`**

Agregar los imports:

```ts
import { SaleItem } from '../modules/sales/entities/sale-item.entity';
import { Sale } from '../modules/sales/entities/sale.entity';
```

Y dejar el array completo:

```ts
    entities: [Business, Category, Product, Sale, SaleItem],
```

- [ ] **Step 4: Verificar que la metadata es válida**

```bash
cd backend && npm run start:dev
```

Esperado: arranca sin errores. Cortar con `Ctrl+C`.

`Sale` y `SaleItem` se importan mutuamente. Si aparece un error del tipo `Cannot read properties of undefined` al construir la relación, es la importación circular: las funciones flecha en `@OneToMany`/`@ManyToOne` son las que la resuelven, verificar que estén escritas así y no como referencias directas a la clase.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat: entidades Sale y SaleItem"
```

---

## Task 8: Migración inicial, README y verificación de punta a punta

**Files:**
- Create: `backend/src/database/migrations/<timestamp>-InitialSchema.ts` (generado)
- Create: `README.md`

**Interfaces:**
- Consumes: las cinco entidades (Tasks 5-7), los scripts de migración (Task 3).
- Produces: el esquema completo creado en la base, y una migración versionada que lo reproduce desde cero.

- [ ] **Step 1: Confirmar que no hay migraciones pendientes antes de generar**

```bash
cd backend && npm run migration:show
```

Esperado: no lista nada. Si listara una migración sin aplicar, hay que correrla antes de generar: `generate` compara contra la base tal como está, y una migración pendiente no aplicada haría que duplique sus cambios.

- [ ] **Step 2: Generar la migración inicial**

```bash
cd backend && npm run migration:generate -- src/database/migrations/InitialSchema
```

Esperado: `Migration ... has been generated successfully.` y un archivo nuevo en `src/database/migrations/`.

- [ ] **Step 3: Leer el SQL generado**

Abrir el archivo. Este paso no es opcional: TypeORM infiere, y a veces infiere mal. Verificar que estén las cinco tablas (`businesses`, `categories`, `products`, `sales`, `sale_items`), sus foreign keys, y estos puntos en particular:

1. **Las fechas son `TIMESTAMP WITH TIME ZONE`**, no `TIMESTAMP`. Si salió sin zona, el `type: 'timestamptz'` no se aplicó.
2. **Los montos son `numeric(12,2)`**.
3. **El índice parcial de `products` conserva el `WHERE`**: tiene que verse algo como
   `CREATE UNIQUE INDEX "..." ON "products" ("business_id", "sku") WHERE active = true`.
   Si el `WHERE` no está, agregarlo a mano en el archivo.
4. **La generación de UUIDs.** Si aparece `uuid_generate_v4()` junto con un
   `CREATE EXTENSION "uuid-ossp"`, reemplazar por `gen_random_uuid()` y borrar el
   `CREATE EXTENSION`: Postgres 13+ lo trae nativo, y es una dependencia menos que tiene
   que existir en la base de producción.

- [ ] **Step 4: Agregar a mano el índice funcional de categories**

TypeORM no puede generar un índice sobre una expresión. Agregar al **final** del método `up()` de la migración:

```ts
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_categories_business_lower_name" ON "categories" ("business_id", lower("name"))`,
    );
```

Y al **principio** del método `down()` (el `down` deshace en orden inverso al `up`):

```ts
    await queryRunner.query(`DROP INDEX "uq_categories_business_lower_name"`);
```

- [ ] **Step 5: Aplicar la migración**

```bash
cd backend && npm run migration:run
```

Esperado: `Migration InitialSchema... has been executed successfully.`

Si falla a mitad de camino, Postgres revierte la migración entera (el DDL es transaccional): la base queda intacta, se corrige el archivo y se vuelve a correr. No hace falta limpiar nada a mano.

- [ ] **Step 6: Confirmar que quedó registrada**

```bash
cd backend && npm run migration:show
```

Esperado: la migración aparece marcada con `[X]`.

- [ ] **Step 7: Verificar los índices contra la base real**

Que TypeORM haya generado el SQL no prueba que Postgres lo haya aceptado como se esperaba. Desde la raíz del repo:

```bash
docker compose exec db psql -U erp -d erp -c "\d products"
```

Esperado, en la sección `Indexes:`, una línea con el índice parcial:

```
"IDX_..." UNIQUE, btree (business_id, sku) WHERE active = true
```

```bash
docker compose exec db psql -U erp -d erp -c "\d categories"
```

Esperado, en `Indexes:`, el índice funcional:

```
"uq_categories_business_lower_name" UNIQUE, btree (business_id, lower(name::text))
```

Si alguno de los dos no aparece con su condición o su expresión, volver al paso 3.

- [ ] **Step 8: Verificar que las restricciones realmente funcionan**

Los índices `UNIQUE` son correctitud, no performance: conviene comprobar que rechazan lo que tienen que rechazar. Desde la raíz del repo:

```bash
docker compose exec db psql -U erp -d erp -c "INSERT INTO businesses (name, email, password_hash) VALUES ('Test', 'test@test.com', 'x'), ('Test 2', 'test@test.com', 'y');"
```

Esperado: **falla** con `duplicate key value violates unique constraint`.

Ahora el índice funcional de categorías:

```bash
docker compose exec db psql -U erp -d erp -c "INSERT INTO businesses (name, email, password_hash) VALUES ('Test', 'test@test.com', 'x') RETURNING id;"
```

Copiar el uuid devuelto y usarlo en el siguiente comando, reemplazando `<UUID>`:

```bash
docker compose exec db psql -U erp -d erp -c "INSERT INTO categories (business_id, name) VALUES ('<UUID>', 'Ropa'), ('<UUID>', 'ropa');"
```

Esperado: **falla** con `duplicate key value violates unique constraint "uq_categories_business_lower_name"`. Esto es lo que prueba que la unicidad case-insensitive funciona.

Limpiar los datos de prueba:

```bash
docker compose exec db psql -U erp -d erp -c "DELETE FROM categories; DELETE FROM businesses;"
```

- [ ] **Step 9: Escribir el `README.md` en la raíz del repo**

````markdown
# Mini ERP Multi-negocio

Sistema de gestión de inventario y ventas multi-tenant: cada negocio se registra y
administra sus productos, stock y ventas de forma aislada del resto.

## Estado

En desarrollo. Backend con la conexión a la base y el esquema listos; el MVP
(auth, productos, ventas, dashboard) todavía no está implementado.

## Stack

- **Backend:** NestJS + TypeScript
- **Base de datos:** PostgreSQL 18 + TypeORM
- **Frontend:** Angular (pendiente)

## Requisitos

- Node.js 22+
- Docker Desktop

## Cómo levantarlo

```bash
# 1. Base de datos (requiere Docker Desktop abierto)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run migration:run
npm run start:dev
```

La API queda en `http://localhost:3000`. Para confirmar que todo está bien:

```bash
curl.exe -i http://localhost:3000/health
```

Debe responder `200` con `{"status":"ok","database":"up"}`.

> El contenedor expone PostgreSQL en el puerto **5433** del host, no en el 5432,
> para poder convivir con una instalación nativa de PostgreSQL en la misma máquina.

## Migraciones

El esquema se maneja exclusivamente con migraciones. `synchronize` está en `false`
y no debe encenderse nunca.

```bash
npm run migration:generate -- src/database/migrations/NombreDelCambio
npm run migration:run
npm run migration:show
npm run migration:revert
```

Después de generar una migración hay que **leer el SQL** antes de aplicarla.

## Documentación

- Diseño: [`docs/superpowers/specs/`](docs/superpowers/specs/)
- Planes de implementación: [`docs/superpowers/plans/`](docs/superpowers/plans/)
````

- [ ] **Step 10: Verificación de punta a punta desde cero**

Este es el criterio de terminado del spec. Borra la base entera y reconstruye todo desde el repo, que es exactamente lo que va a pasar en producción la primera vez.

Desde la raíz del repo:

```bash
docker compose down -v
docker compose up -d
```

Esperar unos segundos a que Postgres inicialice, y después:

```bash
cd backend && npm run migration:run && npm run start:dev
```

Esperado: la migración se aplica sobre la base vacía sin errores y la app arranca.

En otra terminal:

```bash
curl.exe -i http://localhost:3000/health
```

Esperado: `200` con `{"status":"ok","database":"up"}`.

- [ ] **Step 11: Commit**

```bash
git add backend/src/database/migrations README.md
git commit -m "feat: migracion inicial del esquema y README"
```

---

## Notas para quien ejecute este plan

- **`npm run start:dev` no termina solo.** Deja el proceso corriendo en watch mode. Los pasos que lo usan como verificación esperan que se observe la salida y después se corte con `Ctrl+C`. Los pasos que hacen `curl` contra la app necesitan que esté corriendo en otra terminal.
- **Si Docker Desktop no está abierto**, todo comando `docker compose` falla con `cannot find the file specified` sobre un pipe. No es un problema del compose: hay que abrir Docker Desktop y esperar a que arranque el motor.
- **El puerto 5433 no es un capricho.** La máquina tiene PostgreSQL 18 nativo en el 5432. Si en algún momento algo intenta conectarse al 5432 y encuentra una base con otras tablas, es el Postgres nativo, no el del contenedor.
- **Ningún paso de este plan escribe tests automáticos.** Es una decisión del spec (§12), no un olvido. La estrategia de testing se define en el spec del MVP, donde los tests e2e de aislamiento por `business_id` sí tienen valor concreto.

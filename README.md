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

Después de generar una migración hay que **leer el SQL** antes de aplicarla. Dos cosas
que TypeORM genera mal y hay que corregir a mano:

- `uuid_generate_v4()` → reemplazar por `gen_random_uuid()` (nativo, sin extensión).
- Índices sobre expresiones (como `lower(name)`) no se generan: se escriben con
  `queryRunner.query()`.

Para ver el SQL que TypeORM deduce de las entidades sin tocar la base:

```bash
npm run typeorm -- schema:log
```

## Documentación

- Diseño: [`docs/superpowers/specs/`](docs/superpowers/specs/)
- Planes de implementación: [`docs/superpowers/plans/`](docs/superpowers/plans/)

import { join } from 'path';
import { DataSourceOptions, LoggerOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { Business } from '../modules/businesses/entities/business.entity';
import { Category } from '../modules/categories/entities/category.entity';
import { Product } from '../modules/products/entities/product.entity';
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
    entities: [Business, Category, Product],

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

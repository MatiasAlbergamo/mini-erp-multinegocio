import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../config/database.config';
import { validateEnv } from '../config/env.validation';

// El CLI de TypeORM corre fuera de Nest: no hay ConfigModule que cargue el .env.
loadEnv();

const env = validateEnv(process.env);

export default new DataSource(buildDataSourceOptions(env));

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

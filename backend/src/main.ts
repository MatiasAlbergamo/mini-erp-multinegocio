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

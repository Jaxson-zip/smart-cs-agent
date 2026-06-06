import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadApiConfig } from "./config/api-config";

async function bootstrap() {
  const config = loadApiConfig();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: config.webOrigin,
    credentials: true,
  });

  await app.listen(config.port);
}

void bootstrap();

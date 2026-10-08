import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Verbose Nest logs: shows InstanceLoader / RoutesResolver / RouterExplorer
    // so you can see which modules load and which routes they own at boot.
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);

  // ---- Global interceptor: logs Controller.method() per request ----
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ---- Global exception filter: normalizes all errors ----
  app.useGlobalFilters(new AllExceptionsFilter());

  // ---- CORS: only admin panel + consumer site may call from a browser ----
  const origins = (
    config.get<string>('CORS_ORIGINS') ??
    'http://localhost:5173,http://localhost:3001'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({ origin: origins, credentials: true });

  // ---- Global validation ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ---- Swagger ----
  const swagger = new DocumentBuilder()
    .setTitle('Club Management API')
    .setDescription(
      [
        'Multi-tenant court booking platform.',
        '',
        '**Try it:** call `POST /auth/login`, copy the `accessToken`, click **Authorize** and paste it.',
        '',
        '- Platform admin: login without `clubSlug`.',
        '- Club admin and consumers: `clubSlug` + email + password.',
        '- Times are `HH:mm` in the club timezone. `dayOfWeek`: 0 = Sunday ... 6 = Saturday.',
        '- Errors always look like `{ statusCode, error, message, errors?, path, timestamp }`.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger), {
    // keeps your token after a page refresh
    swaggerOptions: { persistAuthorization: true },
  });

  // ---- Listen ----
  const port = Number(config.get('PORT') ?? 3000);
  await app.listen(port);
}

bootstrap();
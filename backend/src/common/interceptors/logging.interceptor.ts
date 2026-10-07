// src/common/interceptors/logging.interceptor.ts
import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Route');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = ctx.getHandler();
    const controller = ctx.getClass();
    const req = ctx.switchToHttp().getRequest();

    const start = Date.now();
    this.logger.log(
      `--> ${controller.name}.${handler.name}() ${req.method} ${req.url}`,
    );

    return next.handle().pipe(
      tap(() =>
        this.logger.log(
          `<-- ${controller.name}.${handler.name}() done in ${Date.now() - start}ms`,
        ),
      ),
    );
  }
}
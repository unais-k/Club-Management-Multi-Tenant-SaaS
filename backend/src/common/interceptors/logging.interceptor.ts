/**
 * Nest interceptor that logs the controller method when a request enters and
 * logs elapsed handler time when its returned observable emits successfully.
 */
import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Route');

  /**
   * Logs the matched controller/method and measures time around the handler observable.
   * @param ctx Nest execution context used to read controller, handler, and HTTP request.
   * @param next Handler wrapper that invokes the route and returns its response observable.
   * @returns The same response observable, with a completion log added by `tap`.
   */
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = ctx.getHandler();
    const controller = ctx.getClass();
    const req = ctx.switchToHttp().getRequest();

    const start = Date.now();
    this.logger.log(
      `--> ${controller.name}.${handler.name}() ${req.method} ${req.url}`,
    );

    return next.handle().pipe(
      /** Logs elapsed time after a successful response value is emitted. */
      tap(() =>
        this.logger.log(
          `<-- ${controller.name}.${handler.name}() done in ${Date.now() - start}ms`,
        ),
      ),
    );
  }
}

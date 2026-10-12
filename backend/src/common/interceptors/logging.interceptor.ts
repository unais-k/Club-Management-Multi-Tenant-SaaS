/**
 * Nest interceptor that logs one line per successful request: method, URL and
 * response status code, after the route handler has returned.
 */
import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Route');

  /**
   * Wraps the route handler and logs the request once its response is emitted.
   * @param ctx Nest execution context used to read the HTTP request and response.
   * @param next Handler wrapper that invokes the route and returns its response observable.
   * @returns The same response observable, with a log line added by `tap`.
   */
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    return next.handle().pipe(
      /** Logs `METHOD URL STATUS` after a successful response value is emitted. */
      tap(() => this.logger.log(`${req.method} ${req.originalUrl} ${res.statusCode}`)),
    );
  }
}
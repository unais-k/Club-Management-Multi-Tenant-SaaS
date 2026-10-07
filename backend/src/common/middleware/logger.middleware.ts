// src/common/middleware/logger.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') ?? '';
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;
      // Derive "module" from first URL segment, e.g. /bookings/123 -> bookings
      const segment = originalUrl.split('/').filter(Boolean)[0] ?? 'root';
      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip} "${userAgent}" [module=${segment}]`,
      );
    });

    next();
  }
}
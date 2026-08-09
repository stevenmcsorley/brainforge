import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';

/**
 * Translates Zod validation failures into 400 responses with field-level detail.
 *
 * Controllers call `Schema.parse(body)` directly; without this filter Nest does
 * not recognise ZodError and returns a 500 with a stack trace instead.
 */
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Request validation failed',
      issues: exception.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
  }
}

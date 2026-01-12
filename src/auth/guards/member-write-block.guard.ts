import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

/**
 * Guard that blocks write operations (POST, PUT, PATCH, DELETE) for MEMBER role
 * Apply this globally or on specific controllers
 */
@Injectable()
export class MemberWriteBlockGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const method = request.method;

        // Only block for MEMBER role
        if (user?.role !== Role.MEMBER) {
            return true;
        }

        // Block write operations for MEMBER
        const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
        if (writeMethods.includes(method)) {
            throw new ForbiddenException(
                'MEMBER role is not authorized to perform write operations',
            );
        }

        return true;
    }
}

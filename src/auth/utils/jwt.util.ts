import { JwtService } from '@nestjs/jwt';
import type { JwtPayload, AuthenticatedUser } from '../strategies';

/**
 * Decodes a JWT token and returns the payload
 */
export function decodeToken(token: string, jwtService: JwtService): JwtPayload {
    return jwtService.decode(token) as JwtPayload;
}

/**
 * Extracts user information from a JWT token
 */
export function extractUserFromToken(
    token: string,
    jwtService: JwtService,
): { userId: string; role: string; tenantId: string } | null {
    try {
        const payload = decodeToken(token, jwtService);

        if (!payload) {
            return null;
        }

        return {
            userId: payload.sub,
            role: payload.user_metadata?.role || '',
            tenantId: payload.user_metadata?.accountId || '',
        };
    } catch {
        return null;
    }
}

/**
 * Validates that the user has access to the specified tenant
 */
export function validateTenantAccess(
    user: AuthenticatedUser,
    requestedTenantId: string,
): boolean {
    return user.accountId === requestedTenantId;
}

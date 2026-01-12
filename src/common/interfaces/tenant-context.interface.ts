import { Role } from '@prisma/client';

/**
 * Context extracted from JWT containing tenant and user information
 * This is passed to all CRUD operations for multi-tenant isolation
 */
export interface TenantContext {
    /** Current user's ID in our database */
    userId: string;
    /** Supabase user ID */
    supabaseId: string;
    /** User's email */
    email: string;
    /** User's role (FOUNDER or TESTER) */
    role: Role;
    /** Tenant/Account ID for data isolation */
    tenantId: string;
}

/**
 * Pagination options for list queries
 */
export interface PaginationOptions {
    /** Number of records to skip */
    skip?: number;
    /** Maximum number of records to return */
    take?: number;
    /** Order by field */
    orderBy?: Record<string, 'asc' | 'desc'>;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        total: number;
        skip: number;
        take: number;
        hasMore: boolean;
    };
}

/**
 * Permission definition for RBAC
 */
export interface PermissionConfig {
    findAll?: Role[];
    findOne?: Role[];
    create?: Role[];
    update?: Role[];
    delete?: Role[];
}

/**
 * Default permissions - all roles can do everything
 */
export const DEFAULT_PERMISSIONS: PermissionConfig = {
    findAll: [Role.FOUNDER, Role.TESTER],
    findOne: [Role.FOUNDER, Role.TESTER],
    create: [Role.FOUNDER, Role.TESTER],
    update: [Role.FOUNDER, Role.TESTER],
    delete: [Role.FOUNDER, Role.TESTER],
};

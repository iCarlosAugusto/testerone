import { Injectable } from '@nestjs/common';
import { Project, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BaseService, TenantContext, PaginatedResponse, PaginationOptions } from '../common';
import { CreateProjectDto, UpdateProjectDto } from './dto';

/**
 * Project Service - Implementation with MEMBER role scoping
 * 
 * Permissions:
 * - FOUNDER: Full access (CRUD)
 * - TESTER: Can view all projects in tenant
 * - MEMBER: Can ONLY view projects they are explicitly assigned to
 */
@Injectable()
export class ProjectService extends BaseService<Project, CreateProjectDto, UpdateProjectDto> {
    constructor(prisma: PrismaService) {
        super(prisma, 'project', {
            // Only FOUNDERs can create/update/delete
            create: [Role.FOUNDER],
            update: [Role.FOUNDER],
            delete: [Role.FOUNDER],
            // All roles can view (but MEMBER has restricted scope)
            findAll: [Role.FOUNDER, Role.TESTER, Role.MEMBER],
            findOne: [Role.FOUNDER, Role.TESTER, Role.MEMBER],
        });
    }

    /**
     * Build where clause based on role:
     * - MEMBER: Only projects where user is a member
     * - Others: All projects in tenant
     */
    private buildRoleScopedWhere(context: TenantContext) {
        const baseWhere = {
            ...this.buildTenantWhere(context),
            deletedAt: null,
        };

        // MEMBER can only see projects they are assigned to
        if (context.role === Role.MEMBER) {
            return {
                ...baseWhere,
                members: {
                    some: {
                        userId: context.userId,
                    },
                },
            };
        }

        return baseWhere;
    }

    /**
     * Override findAll with member-scoped filtering
     */
    async findAll(
        context: TenantContext,
        options: PaginationOptions = {},
    ): Promise<PaginatedResponse<Project>> {
        this.checkPermission(context, 'findAll');

        const { skip = 0, take = 20, orderBy = { createdAt: 'desc' } } = options;
        const where = this.buildRoleScopedWhere(context);

        const [data, total] = await Promise.all([
            this.model.findMany({
                where,
                skip,
                take,
                orderBy,
                include: {
                    owner: {
                        select: { id: true, email: true },
                    },
                },
            }),
            this.model.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                skip,
                take,
                hasMore: skip + take < total,
            },
        };
    }

    /**
     * Override findOne with member-scoped filtering
     */
    async findOne(context: TenantContext, id: string): Promise<Project> {
        this.checkPermission(context, 'findOne');

        const where = {
            id,
            ...this.buildRoleScopedWhere(context),
        };

        const record = await this.model.findFirst({
            where,
            include: {
                owner: {
                    select: { id: true, email: true },
                },
                members: {
                    include: {
                        user: {
                            select: { id: true, email: true, role: true },
                        },
                    },
                },
            },
        });

        if (!record) {
            throw new Error(`Project with ID ${id} not found or access denied`);
        }

        return record;
    }

    /**
     * Override create to add owner relationship
     */
    async create(context: TenantContext, data: CreateProjectDto): Promise<Project> {
        this.checkPermission(context, 'create');

        return this.model.create({
            data: {
                ...data,
                accountId: context.tenantId,
                ownerId: context.userId,
            },
        });
    }

    /**
     * Add a member to a project (FOUNDER only)
     */
    async addMember(
        context: TenantContext,
        projectId: string,
        userId: string,
    ): Promise<void> {
        // Verify caller is FOUNDER
        if (context.role !== Role.FOUNDER) {
            throw new Error('Only FOUNDERs can add project members');
        }

        // Verify project exists and belongs to tenant
        const project = await this.model.findFirst({
            where: {
                id: projectId,
                ...this.buildTenantWhere(context),
            },
        });

        if (!project) {
            throw new Error('Project not found');
        }

        // Add member
        await this.prisma.projectMember.create({
            data: {
                projectId,
                userId,
            },
        });
    }

    /**
     * Remove a member from a project (FOUNDER only)
     */
    async removeMember(
        context: TenantContext,
        projectId: string,
        userId: string,
    ): Promise<void> {
        // Verify caller is FOUNDER
        if (context.role !== Role.FOUNDER) {
            throw new Error('Only FOUNDERs can remove project members');
        }

        await this.prisma.projectMember.deleteMany({
            where: {
                projectId,
                userId,
            },
        });
    }

    /**
     * Find projects owned by current user
     */
    async findMyProjects(context: TenantContext): Promise<Project[]> {
        this.checkPermission(context, 'findAll');

        return this.model.findMany({
            where: {
                ...this.buildTenantWhere(context),
                ownerId: context.userId,
                deletedAt: null,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Find projects by status
     */
    async findByStatus(context: TenantContext, status: string): Promise<Project[]> {
        this.checkPermission(context, 'findAll');

        return this.model.findMany({
            where: {
                ...this.buildRoleScopedWhere(context),
                status,
            },
        });
    }
}

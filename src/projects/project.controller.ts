import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    ParseUUIDPipe,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto, UpdateProjectDto } from './dto';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/strategies';
import { TenantContext, PaginationOptions } from '../common';
import { Role } from '@prisma/client';

/**
 * Helper to convert AuthenticatedUser to TenantContext
 */
function toTenantContext(user: AuthenticatedUser): TenantContext {
    return {
        userId: user.id,
        supabaseId: user.supabaseId,
        email: user.email,
        role: user.role as Role,
        tenantId: user.accountId,
    };
}

@Controller('projects')
export class ProjectController {
    constructor(private readonly projectService: ProjectService) { }

    /**
     * Get all projects (paginated)
     * Both FOUNDER and TESTER can access
     */
    @Get()
    async findAll(
        @CurrentUser() user: AuthenticatedUser,
        @Query('skip') skip?: string,
        @Query('take') take?: string,
    ) {
        const options: PaginationOptions = {
            skip: skip ? parseInt(skip, 10) : 0,
            take: take ? parseInt(take, 10) : 20,
        };

        return this.projectService.findAll(toTenantContext(user), options);
    }

    /**
     * Get my projects (owned by current user)
     */
    @Get('mine')
    async findMyProjects(@CurrentUser() user: AuthenticatedUser) {
        return this.projectService.findMyProjects(toTenantContext(user));
    }

    /**
     * Get a single project by ID
     */
    @Get(':id')
    async findOne(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.projectService.findOne(toTenantContext(user), id);
    }

    /**
     * Create a new project
     * Only FOUNDER can create (enforced by service)
     */
    @Post()
    @Roles(Role.FOUNDER)
    async create(
        @CurrentUser() user: AuthenticatedUser,
        @Body() createDto: CreateProjectDto,
    ) {
        return this.projectService.create(toTenantContext(user), createDto);
    }

    /**
     * Update a project
     * Only FOUNDER can update (enforced by service)
     */
    @Put(':id')
    @Roles(Role.FOUNDER)
    async update(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateDto: UpdateProjectDto,
    ) {
        return this.projectService.update(toTenantContext(user), id, updateDto);
    }

    /**
     * Soft delete a project
     * Only FOUNDER can delete (enforced by service)
     */
    @Delete(':id')
    @Roles(Role.FOUNDER)
    async delete(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.projectService.softDelete(toTenantContext(user), id);
    }

    /**
     * Add a member to a project
     * Only FOUNDER can add members
     */
    @Post(':id/members/:userId')
    @Roles(Role.FOUNDER)
    async addMember(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) projectId: string,
        @Param('userId', ParseUUIDPipe) userId: string,
    ) {
        await this.projectService.addMember(toTenantContext(user), projectId, userId);
        return { message: 'Member added successfully' };
    }

    /**
     * Remove a member from a project
     * Only FOUNDER can remove members
     */
    @Delete(':id/members/:userId')
    @Roles(Role.FOUNDER)
    async removeMember(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) projectId: string,
        @Param('userId', ParseUUIDPipe) userId: string,
    ) {
        await this.projectService.removeMember(toTenantContext(user), projectId, userId);
        return { message: 'Member removed successfully' };
    }
}

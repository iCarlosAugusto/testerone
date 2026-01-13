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
import { EvaluationService } from './evaluation.service';
import {
    CreateEvaluationDto,
    UpdateEvaluationDto,
    AddQuestionDto,
    SubmitFeedbackDto,
} from './dto';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/strategies';
import { TenantContext, PaginationOptions } from '../common';
import { Role } from '@prisma/client';

function toTenantContext(user: AuthenticatedUser): TenantContext {
    return {
        userId: user.id,
        supabaseId: user.supabaseId,
        email: user.email,
        role: user.role as Role,
        tenantId: user.accountId,
    };
}

@Controller('evaluations')
export class EvaluationController {
    constructor(private readonly evaluationService: EvaluationService) { }

    /**
     * Create a new evaluation with questions (FOUNDER only)
     */
    @Post()
    @Roles(Role.FOUNDER)
    async create(
        @CurrentUser() user: AuthenticatedUser,
        @Body() createDto: CreateEvaluationDto,
    ) {
        return this.evaluationService.createEvaluation(
            toTenantContext(user),
            createDto,
        );
    }

    /**
     * List evaluations for a tester (TESTER only)
     * Supports filtering by status: PENDING, ACCEPTED, REJECTED
     * Returns list + counts for each status
     */
    @Get('my-evaluations')
    @Roles(Role.TESTER)
    async findTesterEvaluations(
        @CurrentUser() user: AuthenticatedUser,
        @Query('status') status?: 'PENDING' | 'ACCEPTED' | 'REJECTED',
        @Query('skip') skip?: string,
        @Query('take') take?: string,
    ) {
        const options: PaginationOptions = {
            skip: skip ? parseInt(skip, 10) : 0,
            take: take ? parseInt(take, 10) : 20,
        };
        return this.evaluationService.findTesterEvaluations(
            toTenantContext(user),
            status,
            options,
        );
    }

    /**
     * Get evaluations for a project
     */
    @Get('project/:projectId')
    async findByProject(
        @CurrentUser() user: AuthenticatedUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Query('skip') skip?: string,
        @Query('take') take?: string,
    ) {
        const options: PaginationOptions = {
            skip: skip ? parseInt(skip, 10) : 0,
            take: take ? parseInt(take, 10) : 20,
        };
        return this.evaluationService.findAllByProject(
            toTenantContext(user),
            projectId,
            options,
        );
    }

    /**
     * Get evaluation details
     */
    @Get(':id')
    async findOne(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.evaluationService.getEvaluationDetails(
            toTenantContext(user),
            id,
        );
    }

    /**
     * Update evaluation (FOUNDER only)
     */
    @Put(':id')
    @Roles(Role.FOUNDER)
    async update(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateDto: UpdateEvaluationDto,
    ) {
        return this.evaluationService.updateEvaluation(
            toTenantContext(user),
            id,
            updateDto,
        );
    }

    /**
     * Delete evaluation (FOUNDER only)
     */
    @Delete(':id')
    @Roles(Role.FOUNDER)
    async delete(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        await this.evaluationService.deleteEvaluation(toTenantContext(user), id);
        return { message: 'Evaluation deleted successfully' };
    }

    /**
     * Add question to evaluation (FOUNDER only)
     */
    @Post(':id/questions')
    @Roles(Role.FOUNDER)
    async addQuestion(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) evaluationId: string,
        @Body() questionDto: AddQuestionDto,
    ) {
        return this.evaluationService.addQuestion(
            toTenantContext(user),
            evaluationId,
            questionDto,
        );
    }

    /**
     * Join an evaluation (TESTER only)
     */
    @Post(':id/join')
    @Roles(Role.TESTER)
    async join(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) evaluationId: string,
    ) {
        await this.evaluationService.joinEvaluation(
            toTenantContext(user),
            evaluationId,
        );
        return { message: 'Successfully joined evaluation' };
    }

    /**
     * Submit feedback for an evaluation (TESTER only)
     */
    @Post(':id/feedback')
    @Roles(Role.TESTER)
    async submitFeedback(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) evaluationId: string,
        @Body() feedbackDto: SubmitFeedbackDto,
    ) {
        await this.evaluationService.submitFeedback(
            toTenantContext(user),
            evaluationId,
            feedbackDto,
        );
        return { message: 'Feedback submitted successfully' };
    }
}

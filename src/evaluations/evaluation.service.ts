import {
    Injectable,
    ForbiddenException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { Role, Evaluation, EvaluationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext, PaginatedResponse, PaginationOptions } from '../common';
import {
    CreateEvaluationDto,
    UpdateEvaluationDto,
    AddQuestionDto,
    SubmitFeedbackDto,
} from './dto';

@Injectable()
export class EvaluationService {
    constructor(private prisma: PrismaService) { }

    /**
     * Create an evaluation with nested questions (FOUNDER only)
     * Uses Prisma transaction for atomicity
     */
    async createEvaluation(
        context: TenantContext,
        data: CreateEvaluationDto,
    ): Promise<Evaluation> {
        this.checkFounderPermission(context, 'create evaluations');

        // Verify project exists and belongs to tenant
        const project = await this.prisma.project.findFirst({
            where: {
                id: data.projectId,
                accountId: context.tenantId,
            },
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Create evaluation with questions in a transaction
        return this.prisma.$transaction(async (tx) => {
            const evaluation = await tx.evaluation.create({
                data: {
                    title: data.title,
                    description: data.description,
                    instructions: data.instructions,
                    projectId: data.projectId,
                    createdById: context.userId,
                    accountId: context.tenantId,
                    questions: data.questions
                        ? {
                            create: data.questions.map((q, index) => ({
                                text: q.text,
                                type: q.type,
                                required: q.required ?? true,
                                order: q.order ?? index,
                            })),
                        }
                        : undefined,
                },
                include: {
                    questions: {
                        orderBy: { order: 'asc' },
                    },
                    project: {
                        select: { id: true, name: true },
                    },
                },
            });

            return evaluation;
        });
    }

    /**
     * Get all evaluations for a project (FOUNDER sees all, TESTER sees ACTIVE only)
     */
    async findAllByProject(
        context: TenantContext,
        projectId: string,
        options: PaginationOptions = {},
    ): Promise<PaginatedResponse<Evaluation>> {
        const { skip = 0, take = 20 } = options;

        const baseWhere = {
            projectId,
            accountId: context.tenantId,
        };

        // TESTER can only see ACTIVE evaluations
        const where =
            context.role === Role.TESTER
                ? { ...baseWhere, status: EvaluationStatus.ACTIVE }
                : baseWhere;

        const [data, total] = await Promise.all([
            this.prisma.evaluation.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: {
                        select: { questions: true, participants: true },
                    },
                },
            }),
            this.prisma.evaluation.count({ where }),
        ]);

        return {
            data,
            meta: { total, skip, take, hasMore: skip + take < total },
        };
    }

    /**
     * Get evaluation details with questions
     * FOUNDER: Full details with responses summary
     * TESTER: Instructions and questions only (for ACTIVE evaluations)
     */
    async getEvaluationDetails(
        context: TenantContext,
        evaluationId: string,
    ): Promise<any> {
        const evaluation = await this.prisma.evaluation.findFirst({
            where: {
                id: evaluationId,
                accountId: context.tenantId,
            },
            include: {
                questions: {
                    orderBy: { order: 'asc' },
                },
                project: {
                    select: { id: true, name: true },
                },
                _count: {
                    select: { participants: true },
                },
            },
        });

        if (!evaluation) {
            throw new NotFoundException('Evaluation not found');
        }

        // TESTER can only view ACTIVE evaluations
        if (context.role === Role.TESTER && evaluation.status !== EvaluationStatus.ACTIVE) {
            throw new ForbiddenException('This evaluation is not available for testing');
        }

        // For FOUNDER, include response summary
        if (context.role === Role.FOUNDER) {
            const responseSummary = await this.getResponseSummary(evaluationId);
            return { ...evaluation, responseSummary };
        }

        // For TESTER, check if already participated
        const participation = await this.prisma.evaluationParticipant.findUnique({
            where: {
                evaluationId_userId: {
                    evaluationId,
                    userId: context.userId,
                },
            },
        });

        return {
            ...evaluation,
            hasJoined: !!participation,
            isCompleted: !!participation?.completedAt,
        };
    }

    /**
     * Join an evaluation (TESTER only)
     */
    async joinEvaluation(context: TenantContext, evaluationId: string): Promise<void> {
        if (context.role !== Role.TESTER) {
            throw new ForbiddenException('Only TESTERs can join evaluations');
        }

        const evaluation = await this.prisma.evaluation.findFirst({
            where: {
                id: evaluationId,
                status: EvaluationStatus.ACTIVE,
            },
        });

        if (!evaluation) {
            throw new NotFoundException('Active evaluation not found');
        }

        // Check if already joined
        const existing = await this.prisma.evaluationParticipant.findUnique({
            where: {
                evaluationId_userId: {
                    evaluationId,
                    userId: context.userId,
                },
            },
        });

        if (existing) {
            throw new BadRequestException('Already joined this evaluation');
        }

        await this.prisma.evaluationParticipant.create({
            data: {
                evaluationId,
                userId: context.userId,
            },
        });
    }

    /**
     * Submit feedback responses (TESTER only)
     * Bulk insert all answers at once
     */
    async submitFeedback(
        context: TenantContext,
        evaluationId: string,
        data: SubmitFeedbackDto,
    ): Promise<void> {
        if (context.role !== Role.TESTER) {
            throw new ForbiddenException('Only TESTERs can submit feedback');
        }

        // Verify participation
        const participation = await this.prisma.evaluationParticipant.findUnique({
            where: {
                evaluationId_userId: {
                    evaluationId,
                    userId: context.userId,
                },
            },
        });

        if (!participation) {
            throw new ForbiddenException('You must join this evaluation first');
        }

        if (participation.completedAt) {
            throw new BadRequestException('You have already submitted feedback for this evaluation');
        }

        // Verify evaluation is still active
        const evaluation = await this.prisma.evaluation.findFirst({
            where: {
                id: evaluationId,
                status: EvaluationStatus.ACTIVE,
            },
            include: {
                questions: true,
            },
        });

        if (!evaluation) {
            throw new NotFoundException('Active evaluation not found');
        }

        // Validate all question IDs belong to this evaluation
        const questionIds = evaluation.questions.map((q) => q.id);
        for (const response of data.responses) {
            if (!questionIds.includes(response.questionId)) {
                throw new BadRequestException(
                    `Question ${response.questionId} does not belong to this evaluation`,
                );
            }
        }

        // Submit all responses in a transaction
        await this.prisma.$transaction(async (tx) => {
            // Create responses
            await tx.evaluationResponse.createMany({
                data: data.responses.map((r) => ({
                    questionId: r.questionId,
                    userId: context.userId,
                    answer: { value: r.answer },
                })),
            });

            // Mark participation as completed and set status to ACCEPTED
            await tx.evaluationParticipant.update({
                where: {
                    evaluationId_userId: {
                        evaluationId,
                        userId: context.userId,
                    },
                },
                data: {
                    completedAt: new Date(),
                    status: 'ACCEPTED',
                },
            });
        });
    }

    /**
     * List evaluations for a tester with status filtering and counts
     * Returns evaluations where the tester is a participant
     */
    async findTesterEvaluations(
        context: TenantContext,
        statusFilter?: 'PENDING' | 'ACCEPTED' | 'REJECTED',
        options: PaginationOptions = {},
    ) {
        if (context.role !== Role.TESTER) {
            throw new ForbiddenException('This endpoint is for TESTERs only');
        }

        const { skip = 0, take = 20 } = options;

        // Build where clause for participations
        const participationWhere: any = {
            userId: context.userId,
        };

        if (statusFilter) {
            participationWhere.status = statusFilter;
        }

        // Get evaluations with participation status
        const participations = await this.prisma.evaluationParticipant.findMany({
            where: participationWhere,
            skip,
            take,
            orderBy: { joinedAt: 'desc' },
            include: {
                evaluation: {
                    include: {
                        project: {
                            select: { id: true, name: true },
                        },
                        _count: {
                            select: { questions: true },
                        },
                    },
                },
            },
        });

        // Get total count for pagination
        const total = await this.prisma.evaluationParticipant.count({
            where: participationWhere,
        });

        // Get counts for each status
        const [pendingCount, acceptedCount, rejectedCount] = await Promise.all([
            this.prisma.evaluationParticipant.count({
                where: { userId: context.userId, status: 'PENDING' },
            }),
            this.prisma.evaluationParticipant.count({
                where: { userId: context.userId, status: 'ACCEPTED' },
            }),
            this.prisma.evaluationParticipant.count({
                where: { userId: context.userId, status: 'REJECTED' },
            }),
        ]);

        // Transform data
        const data = participations.map((p) => ({
            id: p.evaluation.id,
            title: p.evaluation.title,
            description: p.evaluation.description,
            status: p.evaluation.status,
            project: p.evaluation.project,
            questionCount: p.evaluation._count.questions,
            participationStatus: p.status,
            joinedAt: p.joinedAt,
            completedAt: p.completedAt,
            rejectedAt: p.rejectedAt,
        }));

        return {
            data,
            meta: {
                total,
                skip,
                take,
                hasMore: skip + take < total,
            },
            counts: {
                pending: pendingCount,
                accepted: acceptedCount,
                rejected: rejectedCount,
            },
        };
    }

    /**
     * Update evaluation (FOUNDER only)
     */
    async updateEvaluation(
        context: TenantContext,
        evaluationId: string,
        data: UpdateEvaluationDto,
    ): Promise<Evaluation> {
        this.checkFounderPermission(context, 'update evaluations');

        const evaluation = await this.prisma.evaluation.findFirst({
            where: {
                id: evaluationId,
                accountId: context.tenantId,
            },
        });

        if (!evaluation) {
            throw new NotFoundException('Evaluation not found');
        }

        return this.prisma.evaluation.update({
            where: { id: evaluationId },
            data,
            include: {
                questions: {
                    orderBy: { order: 'asc' },
                },
            },
        });
    }

    /**
     * Add question to evaluation (FOUNDER only)
     */
    async addQuestion(
        context: TenantContext,
        evaluationId: string,
        data: AddQuestionDto,
    ) {
        this.checkFounderPermission(context, 'add questions');

        const evaluation = await this.prisma.evaluation.findFirst({
            where: {
                id: evaluationId,
                accountId: context.tenantId,
            },
        });

        if (!evaluation) {
            throw new NotFoundException('Evaluation not found');
        }

        return this.prisma.evaluationQuestion.create({
            data: {
                evaluationId,
                text: data.text,
                type: data.type,
                required: data.required ?? true,
                order: data.order ?? 0,
            },
        });
    }

    /**
     * Delete evaluation (FOUNDER only)
     */
    async deleteEvaluation(context: TenantContext, evaluationId: string): Promise<void> {
        this.checkFounderPermission(context, 'delete evaluations');

        const evaluation = await this.prisma.evaluation.findFirst({
            where: {
                id: evaluationId,
                accountId: context.tenantId,
            },
        });

        if (!evaluation) {
            throw new NotFoundException('Evaluation not found');
        }

        await this.prisma.evaluation.delete({
            where: { id: evaluationId },
        });
    }

    /**
     * Get response summary for FOUNDER view
     */
    private async getResponseSummary(evaluationId: string) {
        const questions = await this.prisma.evaluationQuestion.findMany({
            where: { evaluationId },
            include: {
                responses: {
                    include: {
                        user: {
                            select: { id: true, email: true },
                        },
                    },
                },
            },
            orderBy: { order: 'asc' },
        });

        return questions.map((q) => ({
            questionId: q.id,
            text: q.text,
            type: q.type,
            responseCount: q.responses.length,
            responses: q.responses.map((r) => ({
                userId: r.user.id,
                email: r.user.email,
                answer: r.answer,
                submittedAt: r.submittedAt,
            })),
        }));
    }

    /**
     * Check if user is FOUNDER, throw if not
     */
    private checkFounderPermission(context: TenantContext, action: string): void {
        if (context.role !== Role.FOUNDER) {
            throw new ForbiddenException(`Only FOUNDERs can ${action}`);
        }
    }
}

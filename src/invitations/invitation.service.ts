import {
    Injectable,
    ForbiddenException,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, InvitationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantContext } from '../common';
import { SendInviteDto, AcceptInviteDto } from './dto';
import { randomUUID } from 'crypto';

@Injectable()
export class InvitationService {
    private readonly appUrl: string;
    private readonly expirationMinutes = 60; // 60 minutes

    constructor(
        private prisma: PrismaService,
        private supabaseService: SupabaseService,
        private configService: ConfigService,
    ) {
        this.appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    }

    /**
     * Send an invitation (FOUNDER only)
     */
    async sendInvite(context: TenantContext, data: SendInviteDto) {
        this.checkFounderPermission(context);

        // Check if user already exists in this tenant
        const existingUser = await this.prisma.user.findFirst({
            where: {
                email: data.email,
                accountId: context.tenantId,
            },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists in your organization');
        }

        // Check for existing pending invitation
        const existingInvite = await this.prisma.invitation.findFirst({
            where: {
                email: data.email,
                accountId: context.tenantId,
                status: InvitationStatus.PENDING,
            },
        });

        if (existingInvite) {
            // Check if expired
            if (existingInvite.expiresAt > new Date()) {
                throw new ConflictException(
                    'An active invitation already exists for this email. Please wait for it to expire or revoke it.',
                );
            }
            // Mark expired invite
            await this.prisma.invitation.update({
                where: { id: existingInvite.id },
                data: { status: InvitationStatus.EXPIRED },
            });
        }

        // Generate secure token
        const token = randomUUID();
        const expiresAt = new Date(Date.now() + this.expirationMinutes * 60 * 1000);

        // Create invitation
        const invitation = await this.prisma.invitation.create({
            data: {
                email: data.email,
                token,
                role: data.role === 'TESTER' ? Role.TESTER : Role.MEMBER,
                accountId: context.tenantId,
                invitedById: context.userId,
                expiresAt,
            },
            include: {
                account: {
                    select: { name: true },
                },
                invitedBy: {
                    select: { email: true },
                },
            },
        });

        // Build invitation link
        const inviteLink = `${this.appUrl}/register?token=${token}`;

        // TODO: Integrate with email service (e.g., SendGrid, Resend, etc.)
        // For now, return the link in the response
        console.log(`📧 Invitation email would be sent to ${data.email}`);
        console.log(`   Link: ${inviteLink}`);

        return {
            message: 'Invitation sent successfully',
            invitation: {
                id: invitation.id,
                email: invitation.email,
                role: invitation.role,
                expiresAt: invitation.expiresAt,
                inviteLink, // Remove in production - only for development
            },
        };
    }

    /**
     * Validate an invitation token (public endpoint)
     */
    async validateToken(token: string) {
        const invitation = await this.prisma.invitation.findUnique({
            where: { token },
            include: {
                account: {
                    select: { id: true, name: true },
                },
                invitedBy: {
                    select: { email: true },
                },
            },
        });

        if (!invitation) {
            throw new NotFoundException('Invalid invitation token');
        }

        if (invitation.status !== InvitationStatus.PENDING) {
            throw new BadRequestException(`Invitation has already been ${invitation.status.toLowerCase()}`);
        }

        if (invitation.expiresAt < new Date()) {
            // Mark as expired
            await this.prisma.invitation.update({
                where: { id: invitation.id },
                data: { status: InvitationStatus.EXPIRED },
            });
            throw new BadRequestException('Invitation has expired');
        }

        return {
            valid: true,
            email: invitation.email,
            role: invitation.role,
            organization: invitation.account.name,
            invitedBy: invitation.invitedBy.email,
            expiresAt: invitation.expiresAt,
        };
    }

    /**
     * Accept invitation and create user account
     */
    async acceptInvitation(data: AcceptInviteDto) {
        // Validate token first
        const invitation = await this.prisma.invitation.findUnique({
            where: { token: data.token },
            include: {
                account: true,
            },
        });

        if (!invitation) {
            throw new NotFoundException('Invalid invitation token');
        }

        if (invitation.status !== InvitationStatus.PENDING) {
            throw new BadRequestException(`Invitation has already been ${invitation.status.toLowerCase()}`);
        }

        if (invitation.expiresAt < new Date()) {
            await this.prisma.invitation.update({
                where: { id: invitation.id },
                data: { status: InvitationStatus.EXPIRED },
            });
            throw new BadRequestException('Invitation has expired');
        }

        // Check if user already exists
        const existingUser = await this.prisma.user.findUnique({
            where: { email: invitation.email },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        // Create user in Supabase with the tenant's accountId
        const { user: supabaseUser } = await this.supabaseService.signUp(
            invitation.email,
            data.password,
            {
                role: invitation.role,
                accountId: invitation.accountId,
            },
        );

        // Create user in Prisma within transaction
        const user = await this.prisma.$transaction(async (tx) => {
            // Create user with the invitation's accountId (tenant isolation)
            const newUser = await tx.user.create({
                data: {
                    supabaseId: supabaseUser.id,
                    email: invitation.email,
                    role: invitation.role,
                    accountId: invitation.accountId, // CRITICAL: Use invitation's tenantId
                },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    accountId: true,
                },
            });

            // Mark invitation as accepted
            await tx.invitation.update({
                where: { id: invitation.id },
                data: {
                    status: InvitationStatus.ACCEPTED,
                    acceptedAt: new Date(),
                },
            });

            return newUser;
        });

        return {
            message: 'Account created successfully',
            user,
        };
    }

    /**
     * List invitations for the tenant (FOUNDER only)
     */
    async listInvitations(context: TenantContext, status?: InvitationStatus) {
        this.checkFounderPermission(context);

        const where: any = { accountId: context.tenantId };
        if (status) {
            where.status = status;
        }

        return this.prisma.invitation.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                expiresAt: true,
                createdAt: true,
                invitedBy: {
                    select: { email: true },
                },
            },
        });
    }

    /**
     * Revoke an invitation (FOUNDER only)
     */
    async revokeInvitation(context: TenantContext, invitationId: string) {
        this.checkFounderPermission(context);

        const invitation = await this.prisma.invitation.findFirst({
            where: {
                id: invitationId,
                accountId: context.tenantId,
                status: InvitationStatus.PENDING,
            },
        });

        if (!invitation) {
            throw new NotFoundException('Pending invitation not found');
        }

        await this.prisma.invitation.update({
            where: { id: invitationId },
            data: { status: InvitationStatus.REVOKED },
        });

        return { message: 'Invitation revoked successfully' };
    }

    /**
     * Resend an invitation (FOUNDER only)
     */
    async resendInvitation(context: TenantContext, invitationId: string) {
        this.checkFounderPermission(context);

        const invitation = await this.prisma.invitation.findFirst({
            where: {
                id: invitationId,
                accountId: context.tenantId,
            },
        });

        if (!invitation) {
            throw new NotFoundException('Invitation not found');
        }

        // Generate new token and expiry
        const token = randomUUID();
        const expiresAt = new Date(Date.now() + this.expirationMinutes * 60 * 1000);

        await this.prisma.invitation.update({
            where: { id: invitationId },
            data: {
                token,
                expiresAt,
                status: InvitationStatus.PENDING,
            },
        });

        const inviteLink = `${this.appUrl}/register?token=${token}`;

        // TODO: Send email
        console.log(`📧 Invitation resent to ${invitation.email}`);
        console.log(`   Link: ${inviteLink}`);

        return {
            message: 'Invitation resent successfully',
            inviteLink, // Remove in production
        };
    }

    private checkFounderPermission(context: TenantContext): void {
        if (context.role !== Role.FOUNDER) {
            throw new ForbiddenException('Only FOUNDERs can manage invitations');
        }
    }
}

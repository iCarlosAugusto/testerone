import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Query,
    ParseUUIDPipe,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { SendInviteDto, ValidateTokenDto, AcceptInviteDto } from './dto';
import { CurrentUser, Roles, Public } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/strategies';
import { TenantContext } from '../common';
import { Role, InvitationStatus } from '@prisma/client';

function toTenantContext(user: AuthenticatedUser): TenantContext {
    return {
        userId: user.id,
        supabaseId: user.supabaseId,
        email: user.email,
        role: user.role as Role,
        tenantId: user.accountId,
    };
}

@Controller('invitations')
export class InvitationController {
    constructor(private readonly invitationService: InvitationService) { }

    /**
     * Send an invitation (FOUNDER only)
     */
    @Post()
    @Roles(Role.FOUNDER)
    async sendInvite(
        @CurrentUser() user: AuthenticatedUser,
        @Body() sendInviteDto: SendInviteDto,
    ) {
        return this.invitationService.sendInvite(
            toTenantContext(user),
            sendInviteDto,
        );
    }

    /**
     * List invitations for the organization (FOUNDER only)
     */
    @Get()
    @Roles(Role.FOUNDER)
    async listInvitations(
        @CurrentUser() user: AuthenticatedUser,
        @Query('status') status?: InvitationStatus,
    ) {
        return this.invitationService.listInvitations(toTenantContext(user), status);
    }

    /**
     * Validate an invitation token (PUBLIC - no auth required)
     */
    @Get('validate/:token')
    @Public()
    async validateToken(@Param('token') token: string) {
        return this.invitationService.validateToken(token);
    }

    /**
     * Accept an invitation and create account (PUBLIC - no auth required)
     */
    @Post('accept')
    @Public()
    async acceptInvitation(@Body() acceptInviteDto: AcceptInviteDto) {
        return this.invitationService.acceptInvitation(acceptInviteDto);
    }

    /**
     * Revoke an invitation (FOUNDER only)
     */
    @Delete(':id')
    @Roles(Role.FOUNDER)
    async revokeInvitation(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) invitationId: string,
    ) {
        return this.invitationService.revokeInvitation(
            toTenantContext(user),
            invitationId,
        );
    }

    /**
     * Resend an invitation (FOUNDER only)
     */
    @Post(':id/resend')
    @Roles(Role.FOUNDER)
    async resendInvitation(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) invitationId: string,
    ) {
        return this.invitationService.resendInvitation(
            toTenantContext(user),
            invitationId,
        );
    }
}

import {
    Injectable,
    BadRequestException,
    UnauthorizedException,
    ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { SignupDto, LoginDto } from './dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private prismaService: PrismaService,
        private supabaseService: SupabaseService,
    ) { }

    async signup(signupDto: SignupDto) {
        const { email, password, role, accountName } = signupDto;

        // Founders must provide an account name
        if (role === Role.FOUNDER && !accountName) {
            throw new BadRequestException('Account name is required for founders');
        }

        // Check if user already exists in our database
        const existingUser = await this.prismaService.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        // Create account (tenant) first
        const account = await this.prismaService.account.create({
            data: {
                name: accountName || `${email}'s Account`,
            },
        });

        try {
            // Create user in Supabase with role and accountId in metadata
            const { user: supabaseUser } = await this.supabaseService.signUp(
                email,
                password,
                {
                    role,
                    accountId: account.id,
                },
            );

            // Create user in our database
            const user = await this.prismaService.user.create({
                data: {
                    supabaseId: supabaseUser.id,
                    email,
                    role,
                    accountId: account.id,
                },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    accountId: true,
                    createdAt: true,
                },
            });

            return {
                message: 'User registered successfully',
                user,
            };
        } catch (error) {
            // Cleanup: Delete the account if Supabase signup fails
            await this.prismaService.account.delete({
                where: { id: account.id },
            });
            throw error;
        }
    }

    async login(loginDto: LoginDto) {
        const { email, password } = loginDto;

        try {
            const { session } = await this.supabaseService.signIn(email, password);

            // Fetch user from our database
            const user = await this.prismaService.user.findUnique({
                where: { email },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    accountId: true,
                },
            });

            if (!user) {
                throw new UnauthorizedException('User not found in database');
            }

            return {
                message: 'Login successful',
                user,
                accessToken: session.access_token,
                refreshToken: session.refresh_token,
                expiresAt: session.expires_at,
            };
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('Invalid credentials');
        }
    }

    async logout(accessToken: string) {
        try {
            await this.supabaseService.signOut(accessToken);
            return { message: 'Logout successful' };
        } catch {
            // Even if Supabase signout fails, we consider it a success
            return { message: 'Logout successful' };
        }
    }

    async getProfile(userId: string, accountId: string) {
        const user = await this.prismaService.user.findFirst({
            where: {
                id: userId,
                accountId, // Enforce tenant isolation
            },
            select: {
                id: true,
                email: true,
                role: true,
                accountId: true,
                createdAt: true,
                account: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!user) {
            throw new UnauthorizedException('User not found or access denied');
        }

        return user;
    }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
    sub: string; // Supabase user ID
    email: string;
    role: string;
    user_metadata?: {
        role?: string;
        accountId?: string;
    };
    aud: string;
    iat: number;
    exp: number;
}

export interface AuthenticatedUser {
    id: string;
    supabaseId: string;
    email: string;
    role: string;
    accountId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        private prismaService: PrismaService,
    ) {
        const supabaseUrl = configService.get<string>('SUPABASE_URL');
        if (!supabaseUrl) {
            throw new Error('SUPABASE_URL is not configured');
        }

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            // Use Supabase JWKS endpoint for ES256 key verification
            secretOrKeyProvider: passportJwtSecret({
                cache: true,
                rateLimit: true,
                jwksRequestsPerMinute: 5,
                jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
            }),
            algorithms: ['ES256'],
        });
    }

    async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
        const supabaseId = payload.sub;

        // Fetch the user from our database to get the local user ID and tenant info
        const user = await this.prismaService.user.findUnique({
            where: { supabaseId },
            select: {
                id: true,
                supabaseId: true,
                email: true,
                role: true,
                accountId: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('User not found in database');
        }

        return {
            id: user.id,
            supabaseId: user.supabaseId,
            email: user.email,
            role: user.role,
            accountId: user.accountId,
        };
    }
}

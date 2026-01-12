import {
    Controller,
    Post,
    Get,
    Body,
    Headers,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto, LoginDto } from './dto';
import { Public, CurrentUser } from './decorators';
import { JwtAuthGuard } from './guards';
import type { AuthenticatedUser } from './strategies';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
    constructor(private authService: AuthService) { }

    @Public()
    @Post('signup')
    async signup(@Body() signupDto: SignupDto) {
        return this.authService.signup(signupDto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Headers('authorization') authHeader: string) {
        const token = authHeader?.replace('Bearer ', '');
        return this.authService.logout(token);
    }

    @Get('me')
    async getProfile(@CurrentUser() user: AuthenticatedUser) {
        return this.authService.getProfile(user.id, user.accountId);
    }
}

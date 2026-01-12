import { IsEmail, IsNotEmpty, IsEnum, IsOptional, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class SignupDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsNotEmpty()
    @MinLength(6)
    password: string;

    @IsEnum(Role)
    @IsNotEmpty()
    role: Role;

    @IsOptional()
    accountName?: string;
}

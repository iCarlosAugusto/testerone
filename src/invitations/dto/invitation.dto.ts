import {
    IsString,
    IsNotEmpty,
    IsEmail,
    IsOptional,
    IsEnum,
} from 'class-validator';

export class SendInviteDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsEnum(['TESTER', 'MEMBER'])
    @IsOptional()
    role?: 'TESTER' | 'MEMBER';
}

export class ValidateTokenDto {
    @IsString()
    @IsNotEmpty()
    token: string;
}

export class AcceptInviteDto {
    @IsString()
    @IsNotEmpty()
    token: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}

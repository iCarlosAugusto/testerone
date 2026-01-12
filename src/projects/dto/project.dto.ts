import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class CreateProjectDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;
}

export class UpdateProjectDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    status?: 'DRAFT' | 'ACTIVE' | 'TESTING' | 'COMPLETED' | 'ARCHIVED';
}

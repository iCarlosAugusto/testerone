import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsArray,
    ValidateNested,
    IsBoolean,
    IsInt,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuestionDto {
    @IsString()
    @IsNotEmpty()
    text: string;

    @IsEnum(['BOOLEAN', 'TEXT', 'RATING'])
    type: 'BOOLEAN' | 'TEXT' | 'RATING';

    @IsBoolean()
    @IsOptional()
    required?: boolean;

    @IsInt()
    @IsOptional()
    order?: number;
}

export class CreateEvaluationDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    instructions?: string;

    @IsString()
    @IsNotEmpty()
    projectId: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateQuestionDto)
    @IsOptional()
    questions?: CreateQuestionDto[];
}

export class UpdateEvaluationDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    instructions?: string;

    @IsEnum(['DRAFT', 'ACTIVE', 'COMPLETED'])
    @IsOptional()
    status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
}

export class AddQuestionDto {
    @IsString()
    @IsNotEmpty()
    text: string;

    @IsEnum(['BOOLEAN', 'TEXT', 'RATING'])
    type: 'BOOLEAN' | 'TEXT' | 'RATING';

    @IsBoolean()
    @IsOptional()
    required?: boolean;

    @IsInt()
    @IsOptional()
    order?: number;
}

export class SubmitResponseDto {
    @IsString()
    @IsNotEmpty()
    questionId: string;

    // Answer can be boolean, string, or number (rating 1-5)
    @IsNotEmpty()
    answer: boolean | string | number;
}

export class SubmitFeedbackDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SubmitResponseDto)
    responses: SubmitResponseDto[];
}

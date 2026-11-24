import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
export class SalesQueryDto {
  @ApiPropertyOptional({ example: '2026-11-23' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) q?: string;
  @ApiPropertyOptional({ enum: ['completed', 'voided'] })
  @IsOptional()
  @IsIn(['completed', 'voided'])
  status?: 'completed' | 'voided';
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}

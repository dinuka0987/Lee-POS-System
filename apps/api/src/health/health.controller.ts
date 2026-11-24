import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { STORE_NAME, type HealthResponse } from '@lee/shared';
import { Public } from '../auth/auth.decorators';

class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ enum: ['lee-pos-api'] })
  service!: 'lee-pos-api';

  @ApiProperty({ enum: ['Lee'] })
  store!: 'Lee';

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}

@ApiTags('Health')
@Controller('health')
@Public()
export class HealthController {
  @Get()
  @ApiOkResponse({
    type: HealthResponseDto,
    description: 'API liveness; does not check PostgreSQL.',
  })
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'lee-pos-api',
      store: STORE_NAME,
      timestamp: new Date().toISOString(),
    };
  }
}

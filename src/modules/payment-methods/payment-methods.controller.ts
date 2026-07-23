import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaginationDto } from '../../common/pagination.dto';
import type { AuthenticatedRequest } from '../../lib/types/auth';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppException, ErrorCode } from '../../common/errors';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePaymentMethodDto,
  ) {
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED_ACTION,
        'Authenticated user is required',
      );
    }

    return this.service.create(userId, dto);
  }

  @Get()
  list(@Query() p: PaginationDto) {
    return this.service.list(p);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

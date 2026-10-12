/**
 * Consumer-only routes for viewing personal membership assignments and
 * confirming package payment that unlocks booking access.
 */
import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClubId } from '../common/decorators/club-id.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuthUser } from '../common/types/auth-user.js';
import { MembershipsService } from './memberships.service.js';

@ApiTags('Memberships')
@ApiBearerAuth()
@Roles(UserRole.CONSUMER)
@Controller('me/membership')
export class MeMembershipController {
  /**
   * @param membershipsService Loads assignments and confirms payment receipts.
   * @returns No value; Nest injects the service into this controller.
   */
  constructor(private readonly membershipsService: MembershipsService) { }

  @Get()
  @ApiOperation({
    summary: 'Get my current, scheduled, pending-payment, and historical memberships',
    description:
      'Membership packages are assigned by the Club Admin. Consumers cannot self-subscribe or cancel an assignment. The response includes payment status, booking quota usage, and printable receipt details when checkout is confirmed.',
  })
  /**
   * Gets the signed-in consumer's membership summary and history.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated consumer; user.id scopes the assignments.
   * @returns Promise of `{ current, scheduled, pendingPayment, history }`.
   */
  mine(@ClubId() clubId: string, @CurrentUser() user: AuthUser) {
    return this.membershipsService.myMemberships(clubId, user.id);
  }

  @Post(':id/confirm-payment')
  @ApiOperation({
    summary: 'Confirm payment for an assigned membership package',
    description:
      'Marks the package fee as PAID and returns a printable receipt. This is a local flow only: no payment provider is called and no money is collected.',
  })
  @ApiCreatedResponse({ description: 'payment recorded with a receipt.' })
  @ApiConflictResponse({ description: 'The assignment was cancelled or its package is unavailable.' })
  /**
   * Confirms the current consumer's payment for an assigned package.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated consumer; user.id prevents confirming another member's payment.
   * @param id Membership assignment UUID validated by ParseUUIDPipe.
   * @returns Promise of `{ membership, receipt }`; no external payment is processed.
   */
  confirmDemoPayment(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.confirmDemoPayment(clubId, user.id, id);
  }

}

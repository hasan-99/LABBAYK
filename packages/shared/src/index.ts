import { z } from 'zod';

export const userRoleSchema = z.enum(['customer', 'driver_pending', 'driver', 'super_admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const orderStatusSchema = z.enum([
  'requested', 'quoted', 'searching', 'accepted', 'assigned', 'shopping',
  'awaiting_approval', 'purchased', 'delivering', 'delivered', 'settled', 'disputed', 'cancelled',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const moneySchema = z.object({
  amount: z.number().int().nonnegative().safe(),
  currency: z.literal('SYP'),
});
export type Money = z.infer<typeof moneySchema>;

# iKash Backend

## Overview

iKash is a peer-to-peer (P2P) crypto on/off-ramp platform built on the [Stellar](https://stellar.org/) blockchain. It enables users to exchange cryptocurrency assets for fiat currency directly with one another, eliminating the need for a centralized custodian.

## Key Features

- **Non-custodial architecture** - iKash never holds, controls, or has access to user private keys or funds at any point during a transaction
- **Trustless escrow** - Fund security is guaranteed by smart contract-based escrows deployed on the Stellar network, managed through [Trustless Work](https://trustlesswork.com/), an audited and production-grade escrow infrastructure approved within the Stellar ecosystem
- **KYC integration** - Identity verification is handled through [Didit](https://didit.me/)
- **P2P trading** - Direct trades between users from their own Stellar-compatible self-custodial wallets

## Target Users

iKash is built for crypto and Stellar users who need a simpler way to convert digital assets (especially USDC) into local fiat currency without transferring funds to a centralized exchange.

- **Primary markets**: Latin America and other emerging markets where direct on/off-ramp options are limited and local commerce is not yet broadly prepared to accept crypto as a day-to-day payment method
- **User profile**: Users with prior experience using P2P exchanges or self-custodial wallets. The product does not yet include an in-app tutorial, so some familiarity with these tools is recommended

## Problem & Solution

### The Problem

In many target markets, local commerce is not yet ready to accept crypto for everyday transactions. As a result, users holding USDC or other digital assets still need practical ways to convert them to local currency, often through exchanges or P2P alternatives. This process typically involves extra steps, higher fees, longer delays, and custodial risks.

### Our Approach

iKash addresses this by enabling direct trades from users' own Stellar-compatible wallets while maintaining full control of their private keys. The P2P flow is secured through Trustless Work's escrow infrastructure on Stellar, with KYC handled by Didit.

Our core hypothesis is that a non-custodial, trust-minimized approach can offer enough usability, trust, and value for users to choose iKash over their existing off-ramp methods. This remains to be validated with real users.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Audit Logging

The platform maintains a centralized, immutable audit trail for critical
security-relevant actions via `src/modules/audit-log`.

### Usage

Inject `AuditLogService` into any module that performs a critical action and
call `create()` (or `createOrThrow()` for operations where an unaudited
action is unacceptable):

```typescript
await auditLogService.create({
  userId,
  action: AuditAction.ESCROW_RELEASED,
  resourceType: 'Escrow',
  resourceId: escrow.escrowId,
  result: AuditResult.SUCCESS,
  ipAddress,
  userAgent,
  metadata: { transactionHash },
});
```

`create()` never throws — a failed audit write is logged via `Logger.error`
(including the action name and correlation id) and swallowed, so a broken
audit sink alone cannot fail an otherwise successful operation. Use
`createOrThrow()` at call sites where a missing audit record is unacceptable
(the caller is then expected to abort/roll back on failure).

### Action names

All action names are centralized in `AuditAction`
(`src/modules/audit-log/enums/audit-action.enum.ts`) — auth, payment
methods, offers, orders, escrow, disputes, KYC, and admin actions. Add new
actions there rather than using free-form strings, so audit queries stay
reliable.

### Currently integrated flows

| Flow            | Actions                                              | Location                      |
| --------------- | ---------------------------------------------------- | ----------------------------- |
| Auth            | `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILURE`           | `src/modules/auth`            |
| KYC             | `KYC_STATUS_UPDATED`                                 | `src/modules/kyc`             |
| Escrow          | `ESCROW_CREATED`, `ESCROW_FUNDED`, `ESCROW_RELEASED` | `src/modules/escrow`          |
| Payment methods | `PAYMENT_METHOD_CREATED/UPDATED/DELETED`             | `src/modules/payment-methods` |
| Offers          | `OFFER_CREATED/UPDATED/CANCELLED`                    | `src/modules/offer`           |
| Orders          | `ORDER_CREATED/CANCELLED/EXPIRED`                    | `src/modules/order`           |

### Known gaps (no corresponding code path yet)

The following `AuditAction` values are defined and ready to use, but this
codebase has no existing flow to hook them into yet:

- `ESCROW_REFUNDED` — no refund entrypoint currently exists; `EscrowService`
  only has `open`/`initialize`/`fund`/`release`/`syncTransaction`, and
  `syncTransaction`'s `EscrowAction` enum has no `REFUND` case.
- `DISPUTE_OPENED` / `DISPUTE_RESOLVED` — there is no `dispute` module in
  this codebase yet.
- `ADMIN_ACTION_EXECUTED` — there is no admin module or admin-gated
  entrypoint in this codebase yet.

When those flows are built, wire `AuditLogService` into them the same way
as the flows listed above.

### Sensitive data

`metadata` must be an explicitly-selected allowlist of fields — never a raw
request body or full entity dump. Never pass wallet private keys, JWTs,
webhook secrets, passwords, full bank account details, or raw identity
documents into any `AuditLogService` call.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

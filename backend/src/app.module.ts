import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HealthController } from './health.controller';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { OrganizationsController } from './modules/organizations/organizations.controller';
import { MembershipService } from './modules/tenancy/membership.service';
import { ContactsController } from './modules/tenancy/contacts.controller';
import { MembersController } from './modules/tenancy/members.controller';
import { ContactService } from './modules/tenancy/contact.service';
import { PermissionsGuard } from './modules/rbac/permissions.guard';
import { LedgerService } from './modules/ledger/ledger.service';
import { ChartOfAccountsService } from './modules/ledger/chart-of-accounts.service';
import { LedgerController } from './modules/ledger/ledger.controller';
import { PayrollController } from './modules/payroll/payroll.controller';
import { PaymentsController } from './modules/payments/payments.controller';
import { StripeService } from './modules/payments/stripe.service';
import { PayrollService } from './modules/payroll/payroll.service';
import { CountryProviderRegistry } from './modules/country/country-provider.registry';
import { CountryController } from './modules/country/country.controller';
import { InvoicesController } from './modules/invoices/invoices.controller';
import { InvoiceService } from './modules/invoices/invoice.service';
import { BillsController } from './modules/bills/bills.controller';
import { BillService } from './modules/bills/bill.service';
import { BankAccountService } from './modules/banking/bank-account.service';
import { ReconciliationService } from './modules/banking/reconciliation.service';
import { BankAccountsController, BankTransactionsController } from './modules/banking/banking.controller';
import { ReportsService } from './modules/reports/reports.service';
import { ReportsController } from './modules/reports/reports.controller';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { TenantContextMiddleware } from './common/tenant-context.middleware';
import { OperationsController } from './modules/operations/operations.controller';
import { OperationsService } from './modules/operations/operations.service';
import { AiController } from './modules/ai/ai.controller';
import { AiService } from './modules/ai/ai.service';

@Module({
  controllers: [
    HealthController,
    AuthController,
    CountryController,
    OrganizationsController,
    ContactsController,
    MembersController,
    InvoicesController,
    BillsController,
    BankAccountsController,
    BankTransactionsController,
    ReportsController,
    LedgerController,
    PaymentsController,
    PayrollController,
    OperationsController,
    AiController,
  ],
  providers: [
    AuthService,
    JwtAuthGuard,
    MembershipService,
    ContactService,
    PermissionsGuard,
    LedgerService,
    ChartOfAccountsService,
    CountryProviderRegistry,
    InvoiceService,
    BillService,
    BankAccountService,
    ReconciliationService,
    ReportsService,
    StripeService,
    PayrollService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    OperationsService,
    AiService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
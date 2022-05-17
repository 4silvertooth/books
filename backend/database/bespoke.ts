import DatabaseCore from './core';
import { BespokeFunction } from './types';

export class BespokeQueries {
  [key: string]: BespokeFunction;

  static async getLastInserted(
    db: DatabaseCore,
    schemaName: string
  ): Promise<number> {
    const lastInserted = (await db.knex!.raw(
      'select cast(name as int) as num from ?? order by num desc limit 1',
      [schemaName]
    )) as { num: number }[];

    const num = lastInserted?.[0]?.num;
    if (num === undefined) {
      return 0;
    }
    return num;
  }

  static async getTopExpenses(
    db: DatabaseCore,
    fromDate: string,
    toDate: string
  ) {
    const expenseAccounts = db
      .knex!.select('name')
      .from('Account')
      .where('rootType', 'Expense');

    const topExpenses = await db
      .knex!.select({
        total: db.knex!.raw('sum(cast(?? as real)) - sum(cast(?? as real))', [
          'debit',
          'credit',
        ]),
      })
      .select('account')
      .from('AccountingLedgerEntry')
      .where('account', 'in', expenseAccounts)
      .whereBetween('date', [fromDate, toDate])
      .groupBy('account')
      .orderBy('total', 'desc')
      .limit(5);
    return topExpenses;
  }

  static async getTotalOutstanding(
    db: DatabaseCore,
    schemaName: string,
    fromDate: string,
    toDate: string
  ) {
    return await db.knex!(schemaName)
      .sum({ total: 'baseGrandTotal' })
      .sum({ outstanding: 'outstandingAmount' })
      .where('submitted', true)
      .where('cancelled', false)
      .whereBetween('date', [fromDate, toDate])
      .first();
  }

  static async getCashflow(db: DatabaseCore, fromDate: string, toDate: string) {
    const cashAndBankAccounts = db.knex!('Account')
      .select('name')
      .where('accountType', 'in', ['Cash', 'Bank'])
      .andWhere('isGroup', false);
    const dateAsMonthYear = db.knex!.raw('strftime("%Y-%m", ??)', 'date');
    return await db.knex!('AccountingLedgerEntry')
      .where('reverted', false)
      .sum({
        inflow: 'debit',
        outflow: 'credit',
      })
      .select({
        yearmonth: dateAsMonthYear,
      })
      .where('account', 'in', cashAndBankAccounts)
      .whereBetween('date', [fromDate, toDate])
      .groupBy(dateAsMonthYear);
  }

  static async getIncomeAndExpenses(
    db: DatabaseCore,
    fromDate: string,
    toDate: string
  ) {
    const income = await db.knex!.raw(
      `
      select sum(credit - debit) as balance, strftime('%Y-%m', date) as yearmonth
      from AccountingLedgerEntry
      where
        reverted = false and
        date between date(?) and date(?) and
        account in (
          select name
          from Account
          where rootType = 'Income'
        )
      group by yearmonth`,
      [fromDate, toDate]
    );

    const expense = await db.knex!.raw(
      `
      select sum(debit - credit) as balance, strftime('%Y-%m', date) as yearmonth
      from AccountingLedgerEntry
      where
        reverted = false and
        date between date(?) and date(?) and
        account in (
          select name
          from Account
          where rootType = 'Expense'
        )
      group by yearmonth`,
      [fromDate, toDate]
    );

    return { income, expense };
  }
}

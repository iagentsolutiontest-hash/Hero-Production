import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';

export const MODULES: Record<string,{table:string, search:string[], writable:string[]}> = {
 quotes:{table:'quotes',search:['quote_number','status'],writable:['contact_id','quote_number','issue_date','expiry_date','status','currency','subtotal','tax_total','total','notes','data']},
 'credit-notes':{table:'credit_notes',search:['credit_note_number','status'],writable:['contact_id','credit_note_number','issue_date','status','currency','subtotal','tax_total','total','data']},
 'purchase-orders':{table:'purchase_orders',search:['po_number','status'],writable:['contact_id','po_number','order_date','status','currency','total','data']},
 'customer-payments':{table:'customer_payments',search:['reference','status'],writable:['contact_id','invoice_id','payment_date','amount','currency','reference','bank_account_id','status','data']},
 'supplier-payments':{table:'supplier_payments',search:['reference','status'],writable:['contact_id','bill_id','payment_date','amount','currency','reference','bank_account_id','status','data']},
 'bank-rules':{table:'bank_rules',search:['name'],writable:['name','priority','conditions','action','is_active']},
 'opening-balances':{table:'opening_balances',search:['memo','status'],writable:['account_id','effective_date','debit','credit','memo','status']},
 'accounting-periods':{table:'accounting_periods',search:['name','status'],writable:['name','start_date','end_date','status','locked_at']},
 expenses:{table:'expenses',search:['vendor_name','description','status'],writable:['employee_id','vendor_name','expense_date','amount','tax_amount','currency','status','description','data']},
 'expense-claims':{table:'expense_claims',search:['claim_number','status'],writable:['employee_id','claim_number','claim_date','amount','status','data']},
 reimbursements:{table:'reimbursements',search:['reference','status'],writable:['expense_claim_id','payment_date','amount','status','reference','data']},
 products:{table:'products',search:['sku','name'],writable:['sku','name','description','unit_price','purchase_price','tax_rate','quantity_on_hand','is_active','data']},
 'stock-movements':{table:'stock_movements',search:['movement_type','reference'],writable:['product_id','movement_date','quantity','unit_cost','movement_type','reference','data']},
 'fixed-assets':{table:'fixed_assets',search:['asset_code','name','status'],writable:['asset_code','name','acquisition_date','cost','residual_value','useful_life_months','accumulated_depreciation','status','data']},
 projects:{table:'projects',search:['code','name','status'],writable:['code','name','contact_id','status','budget','data']},
 'time-tracking':{table:'time_entries',search:['description'],writable:['project_id','employee_id','entry_date','hours','billable','rate','description','data']},
 'project-costs':{table:'project_costs',search:['description'],writable:['project_id','cost_date','amount','description','data']},
 'project-budgets':{table:'project_budgets',search:[],writable:['project_id','period_start','period_end','amount']},
 files:{table:'files_documents',search:['name','entity_type'],writable:['name','mime_type','storage_key','size_bytes','entity_type','entity_id','metadata']},
 notifications:{table:'notifications',search:['title','message','type'],writable:['user_id','title','message','type','read_at','data']},
 budgets:{table:'budgets',search:['name'],writable:['name','fiscal_year','data']},
};

@Injectable()
export class PlatformService {
 async list(org:string,module:string,q?:string){ const cfg=MODULES[module]; if(!cfg) throw new NotFoundException('Module not found'); const p=getPool(); const vals:any[]=[org]; let where='organization_id=$1'; if(q){ vals.push(`%${q}%`); const i=vals.length; where += ` AND (${cfg.search.map(c=>`${c}::text ILIKE $${i}`).join(' OR ')})`; } const r=await p.query(`SELECT * FROM ${cfg.table} WHERE ${where} ORDER BY created_at DESC NULLS LAST LIMIT 200`,vals); return r.rows; }
 async create(org:string,module:string,body:any){ const cfg=MODULES[module]; if(!cfg) throw new NotFoundException('Module not found'); const keys=cfg.writable.filter(k=>body[k]!==undefined); if(!keys.length) throw new BadRequestException('No writable fields supplied'); const vals=keys.map(k=>body[k]); const cols=['organization_id',...keys]; vals.unshift(org); const marks=cols.map((_,i)=>`$${i+1}`).join(','); const p=getPool(); const r=await p.query(`INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${marks}) RETURNING *`,vals); return r.rows[0]; }
 async update(org:string,module:string,id:string,body:any){ const cfg=MODULES[module]; if(!cfg) throw new NotFoundException('Module not found'); const keys=cfg.writable.filter(k=>body[k]!==undefined); if(!keys.length) throw new BadRequestException('No writable fields supplied'); const vals=keys.map(k=>body[k]); const sets=keys.map((k,i)=>`${k}=$${i+1}`); vals.push(id,org); const r=await getPool().query(`UPDATE ${cfg.table} SET ${sets.join(',')}, updated_at=now() WHERE id=$${vals.length-1} AND organization_id=$${vals.length} RETURNING *`,vals); if(!r.rowCount) throw new NotFoundException('Record not found'); return r.rows[0]; }
 async remove(org:string,module:string,id:string){ const cfg=MODULES[module]; if(!cfg) throw new NotFoundException('Module not found'); const r=await getPool().query(`DELETE FROM ${cfg.table} WHERE id=$1 AND organization_id=$2 RETURNING id`,[id,org]); if(!r.rowCount) throw new NotFoundException('Record not found'); return {id}; }
 async action(org:string,module:string,id:string,status:string){ return this.update(org,module,id,{status}); }
}

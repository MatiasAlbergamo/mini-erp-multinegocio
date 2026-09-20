import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { Product } from '../../products/entities/product.entity';
import { Sale } from './sale.entity';

/**
 * No lleva business_id a proposito: se llega por sale, y duplicarlo seria
 * un dato que puede quedar inconsistente con su venta.
 */
@Entity('sale_items')
// Postgres NO indexa las foreign keys automaticamente (a diferencia de MySQL):
// sin esto, traer los items de una venta escanea toda la tabla.
@Index(['saleId'])
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  saleId: string;

  @ManyToOne(() => Sale, (sale) => sale.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'int' })
  quantity: number;

  // Snapshot del precio al momento de la venta: NO se calcula desde
  // products.price, para que un cambio de precio no altere el historico.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  unitPrice: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  subtotal: number;
}

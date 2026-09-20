import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { Business } from '../../businesses/entities/business.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('products')
@Index(['businessId'])
// Parcial: un SKU de un producto desactivado no bloquea el alta de uno nuevo
// con el mismo codigo. Verificar en el SQL generado que el WHERE sobrevivio.
@Index(['businessId', 'sku'], { unique: true, where: 'active = true' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { nullable: false })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  // Nullable para no obligar a crear una categoria antes del primer producto.
  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 60 })
  sku: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  price: number;

  // Nullable: un negocio chico no siempre tiene el costo cargado,
  // y un 0 mentiria en el calculo de margen.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  cost: number | null;

  // Sin CHECK (>= 0) a proposito: el negocio vende por tres canales, el
  // sistema no es la unica fuente de verdad, y un stock negativo es
  // informacion valida (hubo venta por otro canal o error de carga inicial).
  @Column({ type: 'int', default: 0 })
  stockQuantity: number;

  @Column({ type: 'int', default: 0 })
  lowStockThreshold: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

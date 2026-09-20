import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { Business } from '../../businesses/entities/business.entity';
import { SaleItem } from './sale-item.entity';

@Entity('sales')
// Compuesto: sirve para el filtro simple por negocio (prefijo izquierdo)
// y ademas cubre "ventas del mes" sin ordenar en memoria.
@Index(['businessId', 'createdAt'])
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { nullable: false })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  total: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: ['insert'] })
  items: SaleItem[];
}

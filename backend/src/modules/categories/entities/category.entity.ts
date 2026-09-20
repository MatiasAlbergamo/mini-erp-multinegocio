import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Business } from '../../businesses/entities/business.entity';

/**
 * El UNIQUE funcional sobre (business_id, lower(name)) no se puede expresar
 * con decoradores de TypeORM: se crea a mano en la migracion inicial.
 */
@Entity('categories')
@Index(['businessId'])
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // La FK va como columna escalar Y como relacion: la escalar es la que
  // habilita where: { businessId } sin generar un join en cada lectura.
  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { nullable: false })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'varchar', length: 80 })
  name: string;
}

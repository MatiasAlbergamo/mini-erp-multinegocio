import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 180, unique: true })
  email: string;

  /**
   * select: false — la columna no viene en los find() salvo que se pida
   * con addSelect. Convierte "me olvide de sacar el hash de la respuesta"
   * en un error que hay que escribir a proposito. Solo el login lo pide.
   */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

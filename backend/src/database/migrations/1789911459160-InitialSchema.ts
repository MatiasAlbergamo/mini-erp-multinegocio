import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1789911459160 implements MigrationInterface {
    name = 'InitialSchema1789911459160'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "businesses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(120) NOT NULL, "email" character varying(180) NOT NULL, "password_hash" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_ee58c14c74529ea227d8337ab69" UNIQUE ("email"), CONSTRAINT "PK_bc1bf63498dd2368ce3dc8686e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "business_id" uuid NOT NULL, "name" character varying(80) NOT NULL, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_91da72e2f6ec2a1c45a8f4aaf3" ON "categories" ("business_id") `);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "business_id" uuid NOT NULL, "category_id" uuid, "name" character varying(150) NOT NULL, "sku" character varying(60) NOT NULL, "price" numeric(12,2) NOT NULL, "cost" numeric(12,2), "stock_quantity" integer NOT NULL DEFAULT '0', "low_stock_threshold" integer NOT NULL DEFAULT '0', "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6dfd48915931fee2823e7f8513" ON "products" ("business_id", "sku") WHERE active = true`);
        await queryRunner.query(`CREATE INDEX "IDX_6706ea94d32be01f9272ccc351" ON "products" ("business_id") `);
        await queryRunner.query(`CREATE TABLE "sales" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "business_id" uuid NOT NULL, "total" numeric(12,2) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4f0bc990ae81dba46da680895ea" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6d3ec1c24cea8cc0fdc7747669" ON "sales" ("business_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "sale_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "sale_id" uuid NOT NULL, "product_id" uuid NOT NULL, "quantity" integer NOT NULL, "unit_price" numeric(12,2) NOT NULL, "subtotal" numeric(12,2) NOT NULL, CONSTRAINT "PK_5a7dc5b4562a9e590528b3e08ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c210a330b80232c29c2ad68462" ON "sale_items" ("sale_id") `);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_91da72e2f6ec2a1c45a8f4aaf30" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_6706ea94d32be01f9272ccc3512" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sales" ADD CONSTRAINT "FK_3f9b4d6fecb2ce2eb0cadba3041" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sale_items" ADD CONSTRAINT "FK_c210a330b80232c29c2ad68462a" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sale_items" ADD CONSTRAINT "FK_4ecae62db3f9e9cc9a368d57adb" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        // Indice funcional: TypeORM no puede generarlo desde decoradores.
        // Unicidad case-insensitive del nombre de categoria por negocio.
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_categories_business_lower_name" ON "categories" ("business_id", lower("name"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."uq_categories_business_lower_name"`);
        await queryRunner.query(`ALTER TABLE "sale_items" DROP CONSTRAINT "FK_4ecae62db3f9e9cc9a368d57adb"`);
        await queryRunner.query(`ALTER TABLE "sale_items" DROP CONSTRAINT "FK_c210a330b80232c29c2ad68462a"`);
        await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "FK_3f9b4d6fecb2ce2eb0cadba3041"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_6706ea94d32be01f9272ccc3512"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_91da72e2f6ec2a1c45a8f4aaf30"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c210a330b80232c29c2ad68462"`);
        await queryRunner.query(`DROP TABLE "sale_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6d3ec1c24cea8cc0fdc7747669"`);
        await queryRunner.query(`DROP TABLE "sales"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6706ea94d32be01f9272ccc351"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6dfd48915931fee2823e7f8513"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_91da72e2f6ec2a1c45a8f4aaf3"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TABLE "businesses"`);
    }

}

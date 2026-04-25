import { Module } from "@nestjs/common";
import { LabController } from "./lab.controller";
import { LabService } from "./lab.service";

@Module({
  controllers: [LabController],
  providers: [LabService],
  exports: [LabService],
})
export class LabModule {}

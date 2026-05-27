import { Module } from "@nestjs/common";
import { SafetyController } from "./safety.controller";
import { SafetyService } from "./safety.service";

@Module({
  controllers: [SafetyController],
  providers: [SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}

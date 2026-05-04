import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OidcService } from "./oidc.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, OidcService],
  exports: [AuthService],
})
export class AuthModule {}

import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import {
  LabService,
  type GuardrailCheckRequest,
  type GuardrailCheckResponse,
  type LabExperimentsResponse,
} from "./lab.service";

@Controller("lab")
export class LabController {
  constructor(@Inject(LabService) private readonly labService: LabService) {}

  @Get("experiments")
  getExperiments(): Promise<LabExperimentsResponse> {
    return this.labService.getExperiments();
  }

  @Post("guardrails/check")
  checkGuardrails(
    @Body() body: GuardrailCheckRequest
  ): Promise<GuardrailCheckResponse> {
    return this.labService.checkGuardrails(body);
  }
}

import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import {
  SafetyService,
  type SafetyAnalyzeRequest,
  type SafetyConstitutionalRequest,
  type SafetyCritiqueRequest,
  type SafetyEvaluateRequest,
} from "./safety.service";

@Controller("safety")
export class SafetyController {
  constructor(@Inject(SafetyService) private readonly safetyService: SafetyService) {}

  @Post("analyze")
  analyze(@Body() body: SafetyAnalyzeRequest) {
    return this.safetyService.analyze(body);
  }

  @Post("evaluate")
  evaluate(@Body() body: SafetyEvaluateRequest) {
    return this.safetyService.evaluate(body);
  }

  @Post("critique")
  critique(@Body() body: SafetyCritiqueRequest) {
    return this.safetyService.critique(body);
  }

  @Post("constitutional")
  constitutional(@Body() body: SafetyConstitutionalRequest) {
    return this.safetyService.constitutional(body);
  }

  @Get("runs")
  runs() {
    return this.safetyService.listRuns();
  }

  @Get("fixtures")
  fixtures() {
    return this.safetyService.listFixtures();
  }
}

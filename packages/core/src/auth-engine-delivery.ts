import type { AuthEngineContext } from "./auth-engine-context.js";
import type { EmailMessage, SmsMessage } from "./providers.js";
import { traceDelivery } from "./telemetry.js";

export function sendEmail(ctx: AuthEngineContext, message: EmailMessage): Promise<void> {
  return traceDelivery("email", message.type, () => ctx.emailProvider.send(message));
}

export function sendSms(ctx: AuthEngineContext, message: SmsMessage): Promise<void> {
  return traceDelivery("sms", message.purpose, () => ctx.smsProvider.send(message));
}

ALTER TABLE "stays"."booking_events" DROP CONSTRAINT "booking_events_booking_id_bookings_id_fk";
--> statement-breakpoint
ALTER TABLE "stays"."booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "stays"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Like listing history: rows can never be changed, and go only with their booking (bookings are never deleted by the app).
DROP TRIGGER booking_events_append_only ON "stays"."booking_events";
--> statement-breakpoint
CREATE TRIGGER booking_events_append_only BEFORE UPDATE ON "stays"."booking_events"
  FOR EACH ROW EXECUTE FUNCTION platform.reject_modification();

export const setupSections = [
  ['business', 'Business'], ['whatsapp', 'WhatsApp'], ['meta', 'Meta'], ['telegram', 'Telegram'],
  ['customer_ai', 'Customer AI'], ['pricing', 'Pricing'], ['fitters_dispatch', 'Fitters & Dispatch'],
  ['payments', 'Payments'], ['operating_rules', 'Operating Rules'], ['pilot_readiness', 'Pilot Readiness'],
] as const;

type SectionKey = typeof setupSections[number][0];
export const onboardingStages = [
  'Business Discovery', 'Accounts & Ownership', 'APIs & Integrations', 'Business Configuration',
  'Pricing', 'Fitters & Dispatch', 'WhatsApp / Meta', 'Payments', 'Technical Testing',
  'Owner Training', 'Production Handover', 'Pilot / Live',
] as const;
export type ResponsibleParty = 'owner' | 'tyreops' | 'both' | 'external_provider';
export type SetupPriority = 'required_before_pilot' | 'required_before_handover' | 'recommended' | 'optional';
export type SetupItem = {
  section: SectionKey;
  item_key: string;
  label: string;
  established?: boolean;
  stage: typeof onboardingStages[number];
  responsible: ResponsibleParty;
  priority: SetupPriority;
  explanation: string;
  integration?: { purpose: string; owner: string; credentialLocation: string; billingResponsibility: string };
};

const sectionStage: Record<SectionKey, typeof onboardingStages[number]> = {
  business: 'Business Discovery', whatsapp: 'WhatsApp / Meta', meta: 'WhatsApp / Meta', telegram: 'APIs & Integrations',
  customer_ai: 'Business Configuration', pricing: 'Pricing', fitters_dispatch: 'Fitters & Dispatch',
  payments: 'Payments', operating_rules: 'Business Configuration', pilot_readiness: 'Pilot / Live',
};
const sectionOwner: Record<SectionKey, ResponsibleParty> = {
  business: 'owner', whatsapp: 'both', meta: 'both', telegram: 'tyreops', customer_ai: 'both',
  pricing: 'owner', fitters_dispatch: 'both', payments: 'both', operating_rules: 'owner', pilot_readiness: 'both',
};
const sectionPriority: Record<SectionKey, SetupPriority> = {
  business: 'required_before_pilot', whatsapp: 'required_before_pilot', meta: 'required_before_pilot',
  telegram: 'recommended', customer_ai: 'required_before_pilot', pricing: 'required_before_pilot',
  fitters_dispatch: 'required_before_pilot', payments: 'required_before_pilot',
  operating_rules: 'required_before_handover', pilot_readiness: 'required_before_pilot',
};
const items = (section: SectionKey, labels: Array<[string, string]>, established: string[] = [], defaults: Partial<Pick<SetupItem, 'stage' | 'responsible' | 'priority' | 'explanation'>> = {}): SetupItem[] =>
  labels.map(([item_key, label]) => ({
    section, item_key, label, established: established.includes(item_key),
    stage: defaults.stage || sectionStage[section],
    responsible: defaults.responsible || sectionOwner[section],
    priority: defaults.priority || sectionPriority[section],
    explanation: defaults.explanation || `Confirm and record: ${label.toLowerCase()}. Do not enter passwords, tokens or secret keys.`,
  }));
const integration = (section: SectionKey, item_key: string, label: string, purpose: string): SetupItem => ({
  section, item_key, label, stage: 'APIs & Integrations', responsible: 'both', priority: 'required_before_pilot',
  explanation: `${label} inventory entry: track production readiness, non-secret identifiers, billing and where credentials are securely configured.`,
  integration: {
    purpose,
    owner: 'TyreOps / owner jointly',
    credentialLocation: 'Provider credential store, n8n credential, or server-only dashboard environment',
    billingResponsibility: 'Owner confirms account and billing responsibility',
  },
});

export const onboardingCatalog: SetupItem[] = [
  ...items('business', [
    ['business_identity_confirmed', 'Business identity confirmed'], ['business_name_confirmed', 'Business name confirmed'],
    ['owner_name_confirmed', 'Owner name confirmed'], ['business_description_reviewed', 'Customer-facing description reviewed'],
    ['coverage_notes_captured', 'Coverage captured'], ['operating_hours_captured', 'Operating hours captured'], ['general_notes_reviewed', 'General notes reviewed'],
  ]),
  ...items('whatsapp', [
    ['whatsapp_number_confirmed', 'Primary WhatsApp number confirmed'], ['whatsapp_type_identified', 'Current WhatsApp type identified'],
    ['existing_conversations_inspected', 'Existing customer conversations inspected'], ['personal_messages_use_number', 'Personal-message use understood'],
    ['suppliers_use_number', 'Supplier-message use understood'], ['fitters_use_number', 'Fitter-message use understood'],
    ['important_groups_exist', 'Important WhatsApp groups identified'], ['meta_number_ownership_confirmed', 'Meta number ownership confirmed'],
    ['production_number_connected', 'Production number connected to TyreOps'], ['inbound_text_test_passed', 'Inbound text test passed'],
    ['outbound_ai_reply_test_passed', 'Outbound AI reply test passed'], ['tyre_photo_test_passed', 'Tyre photo test passed'],
    ['human_takeover_test_passed', 'HUMAN takeover test passed'], ['owner_reply_test_passed', 'Owner reply test passed'],
    ['return_to_ai_test_passed', 'RETURN TO AI test passed'],
  ]),
  ...items('meta', [
    ['meta_account_access_confirmed', 'Meta account access confirmed'], ['business_portfolio_identified', 'Business Portfolio identified'],
    ['waba_identified', 'WhatsApp Business Account identified'], ['developer_app_identified', 'Developer App identified'],
    ['owner_admin_access_confirmed', 'Owner/admin access confirmed'], ['permanent_token_configured', 'Permanent/system-user token configured'],
    ['production_webhook_configured', 'Production webhook configured'], ['webhook_verified', 'Webhook verified'],
    ['real_number_connection_status', 'Real-number connection status confirmed'], ['migration_decision', 'Migration/coexistence decision recorded'],
    ['meta_blockers_reviewed', 'Meta blockers and notes reviewed'],
  ]),
  ...items('telegram', [
    ['telegram_integration_exists', 'Telegram integration exists'], ['telegram_destination_confirmed', 'Owner alert destination confirmed'],
    ['human_mode_alert_tested', 'HUMAN-mode inbound alert tested'], ['pricing_alert_tested', 'Pricing alert tested'],
    ['owner_first_refusal_alert_tested', 'Owner-first-refusal alert tested'], ['group_dispatch_alert_tested', 'Group-dispatch alert tested'],
    ['stuck_job_alert_tested', 'Stuck-job alert tested'], ['critical_error_alert_tested', 'Critical error alert tested'],
    ['telegram_alert_preference', 'Owner alert preference recorded'], ['telegram_notes', 'Telegram notes reviewed'],
  ], ['telegram_integration_exists']),
  ...items('customer_ai', [
    ['customer_ai_facts_reviewed', 'Customer AI business facts reviewed with owner'],
    ['customer_ai_description_approved', 'Customer-facing AI description approved'], ['customer_ai_exceptions_reviewed', 'AI exceptions and escalation rules reviewed'],
  ]),
  ...items('pricing', [
    ['pricing_method_agreed', 'Pricing method agreed'], ['pricing_source_identified', 'Pricing source/provider identified'],
    ['supplier_system_identified', 'Supplier website/system identified'], ['supplier_login_setup', 'Supplier login/setup understood'],
    ['price_list_available', 'Spreadsheet or price list availability confirmed'], ['supplier_api_possible', 'Supplier API/integration possibility checked'],
    ['automatic_supplier_lookup_possible', 'Automatic supplier lookup assessed'], ['owner_override_allowed', 'Owner override rule agreed'],
    ['base_markup_logic', 'Base markup/margin logic captured'], ['minimum_callout', 'Minimum callout rule captured'],
    ['distance_surcharge', 'Distance/callout surcharge captured'], ['motorway_surcharge', 'Motorway surcharge captured'],
    ['night_surcharge', 'Night/out-of-hours surcharge captured'], ['urgency_surcharge', 'Urgency surcharge captured'],
    ['multi_tyre_discount', 'Quantity/multi-tyre discount captured'], ['tyre_tier_rules', 'Budget/mid/premium rules captured'],
    ['vat_notes', 'VAT treatment captured'], ['pricing_follow_up', 'Pricing follow-up resolved'],
  ]),
  ...items('pricing', [
    ['pricing_today_method', 'How owner prices jobs today captured'], ['pricing_markup_method', 'Markup method captured'],
    ['pricing_fitting_callout_treatment', 'Fitting/callout treatment captured'], ['pricing_deposit_policy', 'Deposit policy captured'],
    ['pricing_balance_policy', 'Balance policy captured'], ['pricing_unavailable_fallback', 'Unavailable-price fallback captured'],
    ['pricing_test_common_tyre', 'Common tyre pricing test completed'], ['pricing_test_uncommon_tyre', 'Uncommon tyre pricing test completed'],
    ['pricing_test_one_two_four_tyres', 'One, two and four tyre pricing tests completed'],
    ['pricing_test_night_motorway', 'Night and motorway pricing tests completed'], ['pricing_test_manual_owner_price', 'Manual owner price test completed'],
  ]),
  ...items('fitters_dispatch', [
    ['dispatch_method_agreed', 'Preferred dispatch method agreed'], ['owner_has_fitter_groups', 'Fitter WhatsApp group availability confirmed'],
    ['group_first_workflow_confirmed', 'Group-first workflow confirmed by owner'], ['group_message_wording_approved', 'Prepared group-message wording approved'],
    ['group_offer_link_tested', 'Group offer link tested'], ['guest_fitter_model_understood', 'Guest fitter model understood'],
    ['group_wait_time_agreed', 'Group wait/reminder time agreed'], ['direct_fallback_allowed', 'Direct fitter fallback decision recorded'],
    ['auto_release_allowed', 'Automatic release decision explicitly recorded'], ['group_first_ready_to_enable', 'Group-first readiness confirmed'],
    ['first_real_fitter_added', 'First real fitter added'], ['preferred_fitters_identified', 'Preferred fitters identified'],
    ['coverage_rules_confirmed', 'Fitter coverage rules confirmed'], ['priority_rules_confirmed', 'Fitter priority rules confirmed'],
    ['owner_first_refusal_rules_agreed', 'Owner-first-refusal rules agreed'], ['owner_first_refusal_enabled', 'Owner-first-refusal enabled decision'],
    ['owner_first_refusal_duration', 'Owner-first-refusal duration agreed'], ['four_tyre_jobs_rule', 'Four-tyre job rule agreed'],
    ['high_value_threshold', 'High-value threshold agreed'], ['daytime_only_rule', 'Daytime-only rule agreed'],
    ['certain_areas_rule', 'Area-specific rule agreed'], ['owner_reserved_jobs_rule', 'Owner-reserved job rule agreed'],
    ['owner_decline_snooze_rule', 'Owner decline/snooze behavior agreed'], ['group_first_backend_tested', 'Group-first backend tested'],
    ['group_first_dashboard_tested', 'Group-first owner dashboard tested'],
  ], ['group_first_backend_tested', 'group_first_dashboard_tested']),
  ...items('fitters_dispatch', [
    ['registered_fitter_live_approval', 'Registered fitter approved for live use'], ['registered_fitter_test_offer', 'Registered fitter test offer completed'],
    ['registered_fitter_assignment_test', 'Registered fitter assignment tested'], ['registered_fitter_status_updates_tested', 'Registered fitter status updates tested'],
  ]),
  ...items('payments', [
    ['payments_confirmed', 'Payment approach confirmed'], ['stripe_account_confirmed', 'Stripe/business payment account confirmed'],
    ['deposit_rule_confirmed', 'Deposit rule confirmed'], ['typical_deposit_rule', 'Typical deposit amount/rule captured'],
    ['night_deposit_rule', 'Night deposit rule captured'], ['balance_method', 'Remaining balance method captured'],
    ['card_support', 'Card support confirmed'], ['cash_support', 'Cash support confirmed'],
    ['stripe_test_workflow_exists', 'Stripe test workflow exists'], ['stripe_test_payment_passed', 'Stripe test payment passed'],
    ['production_payment_ready', 'Production payment setup ready'], ['refund_cancellation_confirmed', 'Refund/cancellation rule confirmed'],
  ], ['stripe_test_workflow_exists']),
  ...items('operating_rules', [
    ['service_hours', 'Service hours agreed'], ['after_hours_policy', 'After-hours policy agreed'],
    ['motorway_policy', 'Motorway policy agreed'], ['emergency_escalation', 'Emergency/safety escalation agreed'],
    ['travel_area', 'Maximum/typical travel area captured'], ['areas_not_covered', 'Areas not covered captured'],
    ['call_request_behaviour', 'Customer call-request behavior agreed'], ['owner_preferred_jobs', 'Owner-preferred jobs captured'],
    ['manual_approval_jobs', 'Jobs requiring manual approval captured'], ['other_exceptions', 'Other operating exceptions reviewed'],
  ]),
  ...items('pilot_readiness', [
    ['production_dashboard_exists', 'Production dashboard exists'], ['dashboard_iphone_approved', 'Dashboard approved on iPhone'],
    ['owner_login_works', 'Owner login works'], ['controlled_real_job_completed', 'Controlled real job completed'],
  ], ['production_dashboard_exists', 'dashboard_iphone_approved', 'owner_login_works']),
  ...items('pilot_readiness', [
    ['owner_training_login', 'Owner demonstrated login without assistance'], ['owner_training_home_needs_you', 'Owner demonstrated Home and Needs You without assistance'],
    ['owner_training_job_status', 'Owner demonstrated job status understanding without assistance'],
    ['owner_training_conversation_control', 'Owner demonstrated TAKE OVER, reply and RETURN TO AI without assistance'],
    ['owner_training_pricing', 'Owner demonstrated job pricing without assistance'], ['owner_training_first_refusal', 'Owner demonstrated first-refusal handling without assistance'],
    ['owner_training_group_dispatch', 'Owner demonstrated group dispatch without assistance'], ['owner_training_fitters', 'Owner demonstrated add/edit fitter management without assistance'],
    ['owner_training_alerts', 'Owner demonstrated Telegram alert interpretation without assistance'], ['owner_training_escalation', 'Owner knows when to escalate an automation problem'],
  ], [], { stage: 'Owner Training', responsible: 'owner', priority: 'required_before_handover' }),
  ...items('pilot_readiness', [
    ['handover_platform_ownership', 'Platform ownership confirmed'], ['handover_account_recovery', 'Account recovery paths confirmed'],
    ['handover_billing_responsibility', 'Billing responsibility confirmed'], ['handover_production_urls', 'Production URLs recorded'],
    ['handover_secrets_storage', 'Secure secrets storage understood'], ['handover_backup_recovery', 'Backup and recovery approach understood'],
    ['handover_manual_fallback', 'Manual operational fallback understood'], ['handover_support_arrangement', 'Support arrangement confirmed'],
    ['handover_commercial_arrangement', 'Commercial arrangement confirmed'], ['handover_pilot_date', 'Pilot date recorded'], ['handover_review_date', 'Review date recorded'],
  ], [], { stage: 'Production Handover', responsible: 'both', priority: 'required_before_handover' }),
  integration('whatsapp', 'integration_whatsapp_cloud_api', 'WhatsApp Cloud API inventory', 'Inbound/outbound customer WhatsApp automation'),
  integration('meta', 'integration_meta_graph_api', 'Meta Graph API inventory', 'WhatsApp asset, webhook and messaging API control'),
  integration('telegram', 'integration_telegram', 'Telegram inventory', 'Owner operational alerts'),
  integration('payments', 'integration_stripe', 'Stripe inventory', 'Deposits, payment links and payment webhooks'),
  integration('business', 'integration_supabase', 'Supabase inventory', 'Authoritative operational database, auth and RLS'),
  integration('business', 'integration_n8n', 'n8n inventory', 'Production workflow automation'),
  integration('business', 'integration_openai', 'OpenAI inventory', 'AI conversation and extraction support'),
  integration('business', 'integration_vercel', 'Vercel inventory', 'Production dashboard hosting'),
];

export type RuleDefinition = { category: string; rule_key: string; label: string };
const rules = (category: string, rows: Array<[string, string]>): RuleDefinition[] => rows.map(([rule_key, label]) => ({ category, rule_key, label }));
export const ruleCatalog: RuleDefinition[] = [
  ...rules('Product / service', [
    ['tyres_brand_new', 'All supplied tyres are brand new'], ['part_worn_tyres_offered', 'Part-worn tyres are offered'],
    ['fitting_included', 'Fitting is included'], ['mobile_fitting_offered', 'Mobile fitting is offered'],
    ['motorway_callouts_offered', 'Motorway callouts are offered'], ['home_callouts_offered', 'Home callouts are offered'],
    ['workplace_callouts_offered', 'Workplace callouts are offered'], ['car_park_callouts_offered', 'Car-park callouts are offered'],
    ['service_24_7', '24/7 service'], ['budget_tyres_available', 'Budget tyres available'],
    ['mid_range_tyres_available', 'Mid-range tyres available'], ['premium_tyres_available', 'Premium tyres available'],
    ['cars_supported', 'Cars are supported'], ['vans_supported', 'Vans are supported'],
    ['motorcycles_supported', 'Motorcycles and bikes are supported'], ['hgv_supported', 'Lorries and HGVs are supported'],
    ['run_flat_supported', 'Run-flat tyres are supported where applicable'],
  ]),
  ...rules('Customer intake', [
    ['tyre_size_required', 'Tyre size is required'], ['tyre_quantity_required', 'Tyre quantity is required'],
    ['customer_location_required', 'Postcode or live location is required'],
    ['locking_wheel_nut_status_required', 'Locking wheel nut situation is required'],
    ['motorway_status_when_relevant', 'Motorway or roadside status is required when relevant'],
    ['requested_time_required', 'Requested service time is required'],
    ['vehicle_registration_optional', 'Vehicle registration is optional'],
    ['tyre_sidewall_photo_when_size_unknown', 'Ask for a tyre-sidewall photo when size is unknown'],
    ['roadside_safety_check_required', 'Ask a concise safety question for roadside or motorway customers'],
    ['coverage_approximately_40_miles_from_b28', 'Typical coverage is approximately 40 miles from B28/Birmingham'],
    ['customer_tone_natural_uk', 'Customer replies use a natural, concise UK conversational tone'],
  ]),
  ...rules('Payments', [
    ['card_accepted', 'Card accepted'], ['cash_accepted', 'Cash accepted'], ['deposit_required', 'Deposit required'],
    ['balance_paid_on_completion', 'Balance paid on completion'], ['refund_cancellation_policy_confirmed', 'Refund/cancellation policy confirmed'],
    ['bank_transfer_supported', 'Bank transfer is supported'], ['payment_link_supported', 'Payment links are supported'],
    ['refunds_require_owner', 'Refund decisions require owner approval'],
  ]),
  ...rules('Customer promises', [
    ['multi_tyre_discounts_may_be_offered', 'Multi-tyre discounts may be offered'], ['customer_may_request_call', 'Customer may request a call'],
    ['ai_may_quote_exact_prices', 'AI may quote exact prices automatically'], ['ai_may_promise_exact_eta', 'AI may promise exact ETA'],
    ['ai_may_state_tyre_stock', 'AI may state tyre stock'], ['ai_may_state_brands', 'AI may state brands'],
    ['ai_may_confirm_coverage', 'AI may confirm geographical coverage automatically'],
    ['price_negotiation_requires_owner', 'Customer price negotiation requires owner intervention'],
    ['extra_customer_charges_require_owner', 'Additional customer charges require Rescue Tyres approval'],
  ]),
];

export const readinessKeys = [
  'business_identity_confirmed', 'whatsapp_number_confirmed', 'meta_account_access_confirmed', 'production_number_connected',
  'telegram_destination_confirmed', 'customer_ai_facts_reviewed', 'pricing_method_agreed', 'dispatch_method_agreed',
  'owner_first_refusal_rules_agreed', 'payments_confirmed', 'tyre_photo_test_passed', 'dashboard_iphone_approved', 'owner_login_works',
] as const;

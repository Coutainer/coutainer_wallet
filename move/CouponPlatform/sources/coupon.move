module coupon_platform::coupon {
    use sui::object::{UID};
    use sui::transfer;
    use sui::tx_context::TxContext;
    use sui::clock::Clock;
    use sui::event;
    use sui::vec_set::VecSet;
    use sui::sui::SUI;
    use sui::coin::Coin;
    use sui::balance::Balance;
    use std::string::String;

    // === Errors ===
    const ENotAuthorized: u64 = 0;
    const EInvalidAmount: u64 = 1;
    const ECouponExpired: u64 = 2;
    const ECouponNotForSale: u64 = 3;
    const EInsufficientFunds: u64 = 4;
    const EInvalidCoupon: u64 = 5;

    // === Structs ===
    
    /// 쿠폰 오브젝트 - 암호화된 상태로 거래됨
    public struct CouponObject has key, store {
        id: UID,
        // 발행자 주소
        issuer: address,
        // 공급자 주소  
        provider: address,
        // 쿠폰 ID (고유 식별자)
        coupon_id: u64,
        // 쿠폰 타입 (예: "coffee", "meal", "discount")
        coupon_type: String,
        // 쿠폰 값 (할인 금액 또는 상품 가치)
        value: u64,
        // 만료 시간 (timestamp)
        expiry_time: u64,
        // 사용 여부
        used: bool,
        // 암호화된 데이터 (실제 쿠폰 정보)
        encrypted_data: String,
    }

    /// 쿠폰 판매 정보
    public struct CouponSale has key, store {
        id: UID,
        coupon_id: u64,
        seller: address,
        price: u64, // SUI 단위
        active: bool,
    }

    /// 쿠폰 구매 요청
    public struct CouponBuyRequest has key, store {
        id: UID,
        buyer: address,
        max_price: u64,
        coupon_type: String,
        active: bool,
    }

    /// 플랫폼 설정
    public struct PlatformConfig has key {
        id: UID,
        trading_fee_rate: u64, // 수수료율 (예: 100 = 1%)
        treasury: Balance<SUI>,
        authorized_providers: VecSet<address>,
    }

    // === Events ===
    public struct CouponIssued has copy, drop {
        issuer: address,
        provider: address,
        coupon_id: u64,
        value: u64,
    }

    public struct CouponSold has copy, drop {
        seller: address,
        buyer: address,
        coupon_id: u64,
        price: u64,
    }

    public struct CouponUsed has copy, drop {
        user: address,
        coupon_id: u64,
        provider: address,
    }

    // === Functions ===

    /// 플랫폼 초기화
    fun init(ctx: &mut TxContext) {
        let config = PlatformConfig {
            id: sui::object::new(ctx),
            trading_fee_rate: 100, // 1%
            treasury: sui::balance::zero<SUI>(),
            authorized_providers: sui::vec_set::empty(),
        };
        
        transfer::share_object(config);
    }

    /// 공급자 등록 (인증된 공급자만)
    public fun register_provider(
        config: &mut PlatformConfig,
        provider: address,
        _ctx: &TxContext
    ) {
        // 실제로는 권한 체크가 필요
        sui::vec_set::insert(&mut config.authorized_providers, provider);
    }

    /// 쿠폰 발행 (공급자만)
    public fun issue_coupon(
        config: &mut PlatformConfig,
        provider: address,
        coupon_type: String,
        value: u64,
        expiry_days: u64,
        encrypted_data: String,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(sui::vec_set::contains(&config.authorized_providers, &provider), ENotAuthorized);
        assert!(value > 0, EInvalidAmount);

        let current_time = sui::clock::timestamp_ms(clock);
        let expiry_time = current_time + (expiry_days * 24 * 60 * 60 * 1000); // days to ms

        let coupon_id = current_time; // 임시로 timestamp를 ID로 사용

        let coupon = CouponObject {
            id: sui::object::new(ctx),
            issuer: sui::tx_context::sender(ctx),
            provider,
            coupon_id,
            coupon_type,
            value,
            expiry_time,
            used: false,
            encrypted_data,
        };

        event::emit(CouponIssued {
            issuer: sui::tx_context::sender(ctx),
            provider,
            coupon_id,
            value,
        });

        transfer::public_transfer(coupon, sui::tx_context::sender(ctx));
    }

    /// 쿠폰 판매 등록
    public fun list_coupon_for_sale(
        coupon: CouponObject,
        price: u64,
        ctx: &mut TxContext
    ): (CouponSale, CouponObject) {
        assert!(!coupon.used, ECouponNotForSale);
        assert!(price > 0, EInvalidAmount);

        let sale = CouponSale {
            id: sui::object::new(ctx),
            coupon_id: coupon.coupon_id,
            seller: sui::tx_context::sender(ctx),
            price,
            active: true,
        };

        (sale, coupon)
    }

    /// 쿠폰 구매
    public fun buy_coupon(
        sale: &mut CouponSale,
        coupon: CouponObject,
        config: &mut PlatformConfig,
        mut payment: Coin<SUI>,
        ctx: &mut TxContext
    ): (CouponObject, Coin<SUI>) {
        assert!(sale.active, ECouponNotForSale);
        assert!(sui::coin::value(&payment) >= sale.price, EInsufficientFunds);
        assert!(coupon.coupon_id == sale.coupon_id, EInvalidCoupon);

        // 수수료 계산
        let fee = (sale.price * config.trading_fee_rate) / 10000;
        let seller_amount = sale.price - fee;

        // 수수료를 트레저리에 추가
        let fee_coin = sui::coin::split(&mut payment, fee, ctx);
        sui::balance::join(&mut config.treasury, sui::coin::into_balance(fee_coin));

        // 판매자에게 지불
        let seller_coin = sui::coin::split(&mut payment, seller_amount, ctx);
        transfer::public_transfer(seller_coin, sale.seller);

        // 판매 완료 처리
        sale.active = false;

        event::emit(CouponSold {
            seller: sale.seller,
            buyer: sui::tx_context::sender(ctx),
            coupon_id: coupon.coupon_id,
            price: sale.price,
        });

        (coupon, payment)
    }

    /// 쿠폰 사용 (공급자만)
    public fun use_coupon(
        coupon: &mut CouponObject,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(!coupon.used, ECouponNotForSale);
        assert!(sui::clock::timestamp_ms(clock) <= coupon.expiry_time, ECouponExpired);
        assert!(coupon.provider == sui::tx_context::sender(ctx), ENotAuthorized);

        coupon.used = true;

        event::emit(CouponUsed {
            user: sui::tx_context::sender(ctx),
            coupon_id: coupon.coupon_id,
            provider: coupon.provider,
        });
    }

    /// 쿠폰 전송 (개인간 거래)
    public fun transfer_coupon(
        coupon: CouponObject,
        recipient: address,
        _ctx: &TxContext
    ) {
        transfer::public_transfer(coupon, recipient);
    }

    /// 쿠폰 정보 조회
    public fun get_coupon_info(coupon: &CouponObject): (u64, String, u64, u64, bool) {
        (coupon.coupon_id, coupon.coupon_type, coupon.value, coupon.expiry_time, coupon.used)
    }

    /// 만료된 쿠폰 정리 (발행자만)
    public fun cleanup_expired_coupon(
        coupon: CouponObject,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(coupon.issuer == sui::tx_context::sender(ctx), ENotAuthorized);
        assert!(sui::clock::timestamp_ms(clock) > coupon.expiry_time, ECouponExpired);
        
        let CouponObject { id, issuer: _, provider: _, coupon_id: _, coupon_type: _, value: _, expiry_time: _, used: _, encrypted_data: _ } = coupon;
        sui::object::delete(id);
    }
}

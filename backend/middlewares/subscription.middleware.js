/**
 * CafeManager POS - B2B Multi-Tenant SaaS
 * Middleware: CheckSubscription & RequireFeature
 * 
 * NHIỆM VỤ:
 * 1. Kiểm tra ngày hết hạn dịch vụ (ExpiryDate) của Quán:
 *    - Nếu hết hạn hoặc trạng thái 'Expired' -> Chặn request và trả về lỗi 403 Payment Required.
 * 2. Kiểm tra Cờ tính năng (Feature Flags) trong gói Plans đã mua:
 *    - Ví dụ: Chặn API tạo/sửa khách hàng nếu Feature_CRM = false.
 *    - Trả về mã lỗi 403 kèm thông điệp hướng dẫn nâng cấp gói dịch vụ.
 * 3. Kiểm tra Hạn mức tài nguyên (MaxTables Quota):
 *    - Ngăn chặn tạo thêm bàn vượt quá số lượng gói cho phép.
 */

/**
 * 1. Middleware kiểm tra thời hạn thuê bao của Store (CheckSubscription)
 */
function checkSubscription(db) {
    return (req, res, next) => {
        // Bỏ qua kiểm tra nếu là SuperAdmin không gắn với Store cụ thể
        if (req.isSuperAdmin && !req.storeId) {
            return next();
        }

        const storeId = req.storeId;
        if (!storeId) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'STORE_NOT_FOUND',
                    message: 'Không tìm thấy thông tin StoreID tương ứng.'
                }
            });
        }

        // Tìm thông tin Store trong Database
        const store = db.stores.find(s => s.StoreID === storeId);
        if (!store) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'STORE_DOES_NOT_EXIST',
                    message: `Không tìm thấy Cửa hàng với StoreID #${storeId}.`
                }
            });
        }

        // Lấy thông tin Gói cước Plans tương ứng
        const plan = db.plans.find(p => p.PlanID === store.PlanID);

        // Lưu thông tin Store và Plan vào Request Context để các hàm sau tái sử dụng
        req.store = store;
        req.storePlan = plan;

        // KIỂM TRA 1: Trạng thái tài khoản Store
        if (store.SubscriptionStatus === 'Suspended') {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'STORE_SUSPENDED',
                    message: 'Tài khoản quán của bạn đang tạm thời bị khóa. Vui lòng liên hệ bộ phận CSKH SaaS.'
                }
            });
        }

        // KIỂM TRA 2: Ngày hết hạn thuê bao (ExpiryDate)
        const now = new Date();
        const expiryDate = new Date(store.ExpiryDate);

        if (now > expiryDate || store.SubscriptionStatus === 'Expired') {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'SUBSCRIPTION_EXPIRED',
                    statusCode: 403,
                    message: `Tài khoản quán "${store.StoreName}" đã hết hạn thuê bao vào ngày ${expiryDate.toLocaleDateString('vi-VN')}. Vui lòng thanh toán gia hạn để tiếp tục sử dụng hệ thống!`,
                    expiryDate: store.ExpiryDate,
                    currentPlan: plan ? plan.PlanName : 'Chưa xác định',
                    upgradeUrl: '/admin-dashboard.html#billing'
                }
            });
        }

        // Tài khoản còn hạn hợp lệ -> Cho phép đi tiếp
        return next();
    };
}

/**
 * 2. Factory Middleware: Kiểm tra Cờ Tính Năng Của Gói SaaS (requireFeature)
 * @param {string} featureFlag Tên cờ tính năng: 'Feature_CRM', 'Feature_Inventory', 'Feature_KDS', 'Feature_MultiBranch'
 * @param {string} featureNameVi Tên tiếng Việt hiển thị trong thông báo
 */
function requireFeature(featureFlag, featureNameVi = 'tính năng này') {
    return (req, res, next) => {
        // SuperAdmin luôn có quyền vượt qua
        if (req.isSuperAdmin) {
            return next();
        }

        const plan = req.storePlan;
        if (!plan) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'PLAN_NOT_CONFIGURED',
                    message: 'Chưa cấu hình gói dịch vụ cho quán này.'
                }
            });
        }

        // Kiểm tra xem cờ tính năng có được bật trong gói cước này không
        const isFeatureAllowed = Boolean(plan[featureFlag]);

        if (!isFeatureAllowed) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FEATURE_NOT_IN_PLAN',
                    statusCode: 403,
                    message: `Tính năng "${featureNameVi}" không khả dụng trong gói hiện tại [${plan.PlanName}]. Vui lòng nâng cấp lên gói Pro hoặc Enterprise để mở khóa!`,
                    currentPlan: plan.PlanName,
                    requiredFeature: featureFlag,
                    monthlyPriceToUpgrade: 'Từ 699.000 đ/tháng',
                    upgradeUrl: '/admin-dashboard.html#upgrade'
                }
            });
        }

        return next();
    };
}

/**
 * 3. Middleware: Kiểm tra Hạn Mức Số Bàn (checkMaxTablesQuota)
 * Tự động chặn nếu chủ quán cố tình tạo số lượng bàn vượt MaxTables của gói đã mua
 */
function checkMaxTablesQuota(db) {
    return (req, res, next) => {
        if (req.isSuperAdmin) return next();

        const plan = req.storePlan;
        const storeId = req.storeId;

        if (plan && plan.MaxTables) {
            const currentTablesCount = db.tables.filter(t => t.StoreID === storeId).length;

            if (currentTablesCount >= plan.MaxTables) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'QUOTA_MAX_TABLES_EXCEEDED',
                        statusCode: 403,
                        message: `Quán của bạn đã đạt giới hạn tối đa ${plan.MaxTables} bàn của gói [${plan.PlanName}]. Không thể tạo thêm bàn mới. Vui lòng nâng cấp gói SaaS để mở rộng!`,
                        currentCount: currentTablesCount,
                        maxAllowed: plan.MaxTables,
                        upgradeUrl: '/admin-dashboard.html#upgrade'
                    }
                });
            }
        }

        return next();
    };
}

module.exports = {
    checkSubscription,
    requireFeature,
    checkMaxTablesQuota
};
